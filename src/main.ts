import { App, MarkdownView, Notice, Plugin, PluginSettingTab, Setting } from "obsidian";

const SCROLL_STEP_PX = 60;
const SEQUENCE_TIMEOUT_MS = 800;

interface PreviewWithScroll {
	getScroll?: () => number;
}

interface ReadingVimSettings {
	nvimBinaryPath: string;
}

const DEFAULT_SETTINGS: ReadingVimSettings = {
	nvimBinaryPath: "/opt/homebrew/bin/nvim",
};

export default class ReadingVimPlugin extends Plugin {
	settings: ReadingVimSettings = DEFAULT_SETTINGS;
	private pendingG = false;
	private pendingDigits = "";
	private pendingTimer: number | null = null;
	private styleEl: HTMLStyleElement | null = null;

	async onload() {
		await this.loadSettings();
		this.addSettingTab(new ReadingVimSettingTab(this.app, this));
		this.registerDomEvent(document, "keydown", this.handleKeydown, { capture: true });
		this.registerDomEvent(document, "scroll", this.handlePreviewScroll, { capture: true });

		this.registerMarkdownPostProcessor((el) => {
			const paragraphs = el.querySelectorAll("p");
			for (const p of Array.from(paragraphs)) {
				const match = p.textContent?.match(/^file::\s*(.+?)\s*$/);
				if (match) {
					p.classList.add("reading-vim-file-tag");
					p.dataset.filePath = match[1];
				}
			}
		});

		this.styleEl = document.createElement("style");
		this.styleEl.id = "reading-vim-styles";
		this.styleEl.textContent = `
			.reading-vim-file-tag {
				background: var(--background-modifier-hover);
				border-left: 3px solid var(--interactive-accent);
				padding: 2px 8px;
				border-radius: 3px;
				font-family: var(--font-monospace);
				font-size: var(--font-smaller);
				opacity: 0.8;
			}
		`;
		document.head.appendChild(this.styleEl);
	}

	onunload() {
		this.clearPending();
		this.styleEl?.remove();
	}

	private clearPending() {
		this.pendingG = false;
		this.pendingDigits = "";
		if (this.pendingTimer !== null) {
			window.clearTimeout(this.pendingTimer);
			this.pendingTimer = null;
		}
	}

	private armTimer() {
		if (this.pendingTimer !== null) window.clearTimeout(this.pendingTimer);
		this.pendingTimer = window.setTimeout(() => this.clearPending(), SEQUENCE_TIMEOUT_MS);
	}

	private handleKeydown = (evt: KeyboardEvent) => {
		if (evt.isComposing) return;
		if (evt.metaKey || evt.altKey) return;

		const key = evt.key;
		if (key === "Shift" || key === "Control" || key === "Alt" || key === "Meta") return;

		const target = evt.target as HTMLElement | null;
		if (target) {
			if (target.isContentEditable) return;
			const tag = target.tagName;
			if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
		}

		const view = this.app.workspace.getActiveViewOfType(MarkdownView);
		if (!view || view.getMode() !== "preview") {
			this.clearPending();
			return;
		}

		const scroller = view.contentEl.querySelector<HTMLElement>(".markdown-preview-view");
		if (!scroller) {
			this.clearPending();
			return;
		}

		const { ctrlKey: ctrl, shiftKey: shift } = evt;

		if (!shift && (key === "d" || key === "u")) {
			evt.preventDefault();
			evt.stopPropagation();
			this.clearPending();
			const step = scroller.clientHeight / 2;
			scroller.scrollBy({ top: key === "d" ? step : -step });
			return;
		}

		if (ctrl) return;

		if (!shift && (key === "j" || key === "k")) {
			evt.preventDefault();
			evt.stopPropagation();
			this.clearPending();
			scroller.scrollBy({ top: key === "j" ? SCROLL_STEP_PX : -SCROLL_STEP_PX });
			return;
		}

		if (!shift && (key === "h" || key === "l")) {
			evt.preventDefault();
			evt.stopPropagation();
			this.clearPending();
			scroller.scrollBy({ left: key === "l" ? SCROLL_STEP_PX : -SCROLL_STEP_PX });
			return;
		}

		if (!shift && key.length === 1 && key >= "0" && key <= "9") {
			if (this.pendingDigits === "" && key === "0") return;
			this.pendingDigits += key;
			this.pendingG = false;
			this.armTimer();
			evt.preventDefault();
			evt.stopPropagation();
			return;
		}

		if (!shift && key === "g") {
			evt.preventDefault();
			evt.stopPropagation();
			if (this.pendingG) {
				this.clearPending();
				scroller.scrollTo({ top: 0 });
				return;
			}
			this.pendingG = true;
			this.pendingDigits = "";
			this.armTimer();
			return;
		}

		if (shift && key === "G") {
			evt.preventDefault();
			evt.stopPropagation();
			const digits = this.pendingDigits;
			this.clearPending();
			this.jumpToLine(view, scroller, digits);
			return;
		}

		if (!shift && key === "f") {
			evt.preventDefault();
			evt.stopPropagation();
			this.clearPending();
			this.openFileInNeovim(scroller);
			return;
		}

		this.clearPending();
	};

	private jumpToLine(view: MarkdownView, scroller: HTMLElement, digits: string) {
		const maxScroll = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
		if (digits === "") {
			scroller.scrollTo({ top: maxScroll });
			return;
		}
		const n = parseInt(digits, 10);
		if (!Number.isFinite(n) || n <= 1) {
			scroller.scrollTo({ top: 0 });
			return;
		}
		const totalLines = Math.max(1, view.data.split("\n").length);
		if (totalLines <= 1) {
			scroller.scrollTo({ top: 0 });
			return;
		}
		const clamped = Math.min(n, totalLines);
		const fraction = (clamped - 1) / (totalLines - 1);
		scroller.scrollTo({ top: fraction * maxScroll });
	}

	private handlePreviewScroll = (evt: Event) => {
		const target = evt.target;
		if (!(target instanceof HTMLElement)) return;
		if (!target.classList.contains("markdown-preview-view")) return;
		const view = this.viewFromElement(target);
		if (!view || view.getMode() !== "preview") return;
		this.syncCursorToPreview(view);
	};

	private syncCursorToPreview(view: MarkdownView) {
		const preview = view.previewMode as unknown as PreviewWithScroll;
		if (typeof preview?.getScroll !== "function") return;
		const line = preview.getScroll();
		if (!Number.isFinite(line)) return;
		const total = view.editor.lineCount();
		const target = Math.min(Math.max(0, Math.floor(line)), Math.max(0, total - 1));
		view.editor.setCursor({ line: target, ch: 0 });
	}

	private viewFromElement(el: HTMLElement): MarkdownView | null {
		for (const leaf of this.app.workspace.getLeavesOfType("markdown")) {
			const v = leaf.view;
			if (v instanceof MarkdownView && v.contentEl.contains(el)) return v;
		}
		return null;
	}

	private findFileTag(scroller: HTMLElement): string | null {
		const tags = Array.from(scroller.querySelectorAll<HTMLElement>(".reading-vim-file-tag"));
		if (tags.length === 0) return null;

		const scrollerRect = scroller.getBoundingClientRect();

		const visible = tags.filter((tag) => {
			const r = tag.getBoundingClientRect();
			return r.bottom > scrollerRect.top && r.top < scrollerRect.bottom;
		});

		if (visible.length > 0) {
			return visible[0].dataset.filePath ?? null;
		}

		let lastAbove: HTMLElement | null = null;
		for (const tag of tags) {
			if (tag.getBoundingClientRect().bottom <= scrollerRect.top) {
				lastAbove = tag;
			}
		}

		return lastAbove?.dataset.filePath ?? null;
	}

	private findSocketForFile(filePath: string): string | null {
		const fs = require("fs") as typeof import("fs");
		const path = require("path") as typeof import("path");
		let dir = path.dirname(filePath);
		while (dir && dir !== "/") {
			const name = dir.replace(/^\//, "").replace(/\//g, "-");
			const sock = `/tmp/nvim-${name}.sock`;
			if (fs.existsSync(sock)) return sock;
			dir = path.dirname(dir);
		}
		return null;
	}

	private openFileInNeovim(scroller: HTMLElement) {
		const filePath = this.findFileTag(scroller);

		if (!filePath) {
			new Notice("No file:: tag found");
			return;
		}

		const socket = this.findSocketForFile(filePath);
		if (!socket) {
			new Notice("No neovim instance found for this file");
			return;
		}

		const escaped = filePath.replace(/'/g, "'\\''");
		const cmd = `${this.settings.nvimBinaryPath} --server '${socket}' --remote-send ':e ${escaped}<CR>'`;

		const { exec } = require("child_process") as typeof import("child_process");
		exec(cmd, (err: Error | null) => {
			if (err) {
				new Notice(`Failed to open in neovim: ${err.message}`);
			}
		});
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}

class ReadingVimSettingTab extends PluginSettingTab {
	plugin: ReadingVimPlugin;

	constructor(app: App, plugin: ReadingVimPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		new Setting(containerEl)
			.setName("Neovim binary path")
			.setDesc("Path to the nvim executable")
			.addText(text => text
				.setPlaceholder("nvim")
				.setValue(this.plugin.settings.nvimBinaryPath)
				.onChange(async (value) => {
					this.plugin.settings.nvimBinaryPath = value;
					await this.plugin.saveSettings();
				}));
	}
}
