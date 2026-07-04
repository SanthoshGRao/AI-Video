import { Command, type CommandResult } from "@/commands/base-command";
import type { TTransition } from "@/timeline";
import { generateUUID } from "@/utils/id";
import { EditorCore } from "@/core";

export class AddTransitionCommand extends Command {
	private newTransition: TTransition | null = null;

	constructor(
		private props: {
			clipAId: string;
			clipBId: string;
			type: "fade" | "zoom" | "slide" | "blur" | "push";
			durationMs: number;
		},
	) {
		super();
	}

	execute(): CommandResult | undefined {
		const editor = EditorCore.getInstance();
		const scene = editor.scenes.getActiveSceneOrNull();
		if (!scene) return undefined;

		this.newTransition = {
			id: generateUUID(),
			clipAId: this.props.clipAId,
			clipBId: this.props.clipBId,
			type: this.props.type,
			durationMs: this.props.durationMs,
		};

		const currentTransitions = scene.transitions || [];
		editor.scenes.updateSceneTransitions({
			transitions: [...currentTransitions, this.newTransition],
		});
		return undefined;
	}

	undo(): void {
		if (!this.newTransition) return;
		const transitionId = this.newTransition.id;
		
		const editor = EditorCore.getInstance();
		const scene = editor.scenes.getActiveSceneOrNull();
		if (!scene || !scene.transitions) return;
		
		editor.scenes.updateSceneTransitions({
			transitions: scene.transitions.filter((t: any) => t.id !== transitionId),
		});
	}

	redo(): CommandResult | undefined {
		if (!this.newTransition) return undefined;
		
		const editor = EditorCore.getInstance();
		const scene = editor.scenes.getActiveSceneOrNull();
		if (!scene) return;
		
		const currentTransitions = scene.transitions || [];
		editor.scenes.updateSceneTransitions({
			transitions: [...currentTransitions, this.newTransition],
		});
		return undefined;
	}
}
