import * as React from "react";
import { cn } from "@/utils/ui";

const ScrollArea = React.forwardRef<
	HTMLDivElement,
	React.HTMLAttributes<HTMLDivElement>
>(({ className, children, ...props }, ref) => (
	<div
		ref={ref}
		className={cn("scrollbar-thin overflow-auto", className)}
		{...props}
	>
		{children}
	</div>
));
ScrollArea.displayName = "ScrollArea";

const ScrollBar = React.forwardRef<
	HTMLDivElement,
	React.HTMLAttributes<HTMLDivElement> & { orientation?: string }
>(({ className, orientation, ...props }, ref) => (
	<div ref={ref} className={cn("hidden", className)} {...props} />
));
ScrollBar.displayName = "ScrollBar";

export { ScrollArea, ScrollBar };
