import { MarkdownView, Plugin } from "obsidian";

const SCROLL_STEP_PX = 60;
const SEQUENCE_TIMEOUT_MS = 800;

interface PreviewWithScroll {
	getScroll?: () => number;
}

export default class ReadingVimPlugin extends Plugin {
	private pendingG = false;
	private pendingDigits = "";
	private pendingTimer: number | null = null;

	async onload() {
		this.registerDomEvent(document, "keydown", this.handleKeydown, { capture: true });
		this.registerDomEvent(document, "scroll", this.handlePreviewScroll, { capture: true });
	}

	onunload() {
		this.clearPending();
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
}
