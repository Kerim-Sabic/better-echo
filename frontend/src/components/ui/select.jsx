"use client";

import * as React from "react";
import * as SelectPrimitive from "@radix-ui/react-select";
import { ChevronDown, ChevronUp } from "lucide-react";

import { cn } from "../../lib/utils";

const Select = SelectPrimitive.Root;

const SelectGroup = SelectPrimitive.Group;

const SelectValue = SelectPrimitive.Value;

const SelectTrigger = React.forwardRef(
    ({ className, children, ...props }, ref) => (
        <SelectPrimitive.Trigger
            ref={ref}
            className={cn(
                "group flex h-11 w-full items-center justify-between rounded-lg",
                "border border-border bg-card px-3 text-sm font-medium text-foreground",
                "shadow-[0_4px_16px_rgba(15,23,42,0.06)] transition-all duration-200",
                "hover:-translate-y-[1px] hover:border-primary hover:shadow-[0_16px_40px_rgba(6,182,212,0.18)]",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                "disabled:cursor-not-allowed disabled:opacity-60 [&>span]:line-clamp-1",
                className
            )}
            {...props}
        >
            {children}
            <SelectPrimitive.Icon asChild>
                <ChevronDown
                    className="h-4 w-4 text-muted-foreground transition-transform duration-200 group-data-[state=open]:rotate-180 group-hover:text-foreground"
                />
            </SelectPrimitive.Icon>
        </SelectPrimitive.Trigger>
    )
);
SelectTrigger.displayName = SelectPrimitive.Trigger.displayName;

const SelectScrollUpButton = React.forwardRef(
    ({ className, ...props }, ref) => (
        <SelectPrimitive.ScrollUpButton
            ref={ref}
            className={cn(
                "flex cursor-default items-center justify-center bg-card py-2 text-muted-foreground",
                className
            )}
            {...props}
        >
            <ChevronUp className="h-4 w-4" />
        </SelectPrimitive.ScrollUpButton>
    )
);
SelectScrollUpButton.displayName = SelectPrimitive.ScrollUpButton.displayName;

const SelectScrollDownButton = React.forwardRef(
    ({ className, ...props }, ref) => (
        <SelectPrimitive.ScrollDownButton
            ref={ref}
            className={cn(
                "flex cursor-default items-center justify-center bg-card py-2 text-muted-foreground",
                className
            )}
            {...props}
        >
            <ChevronDown className="h-4 w-4" />
        </SelectPrimitive.ScrollDownButton>
    )
);
SelectScrollDownButton.displayName =
    SelectPrimitive.ScrollDownButton.displayName;

const SelectContent = React.forwardRef(
    ({ className, children, position = "popper", ...props }, ref) => (
        <SelectPrimitive.Portal>
            <SelectPrimitive.Content
                ref={ref}
                sideOffset={8}
                className={cn(
                    "z-50 min-w-[12rem] overflow-hidden rounded-xl border border-border bg-card text-foreground",
                    "shadow-[0_20px_60px_rgba(15,23,42,0.16)] ring-1 ring-black/5 animate-fade-in",
                    position === "popper" &&
                        "data-[side=bottom]:translate-y-1 data-[side=top]:-translate-y-1",
                    className
                )}
                position={position}
                {...props}
            >
                <SelectScrollUpButton />
                <SelectPrimitive.Viewport
                    className={cn(
                        "py-2",
                        position === "popper" &&
                            "h-[var(--radix-select-trigger-height)] w-full min-w-[var(--radix-select-trigger-width)]"
                    )}
                >
                    {children}
                </SelectPrimitive.Viewport>
                <SelectScrollDownButton />
            </SelectPrimitive.Content>
        </SelectPrimitive.Portal>
    )
);
SelectContent.displayName = SelectPrimitive.Content.displayName;

const SelectLabel = React.forwardRef(({ className, ...props }, ref) => (
    <SelectPrimitive.Label
        ref={ref}
        className={cn("py-1.5 pl-8 pr-2 text-sm font-semibold", className)}
        {...props}
    />
));
SelectLabel.displayName = SelectPrimitive.Label.displayName;

const SelectItem = React.forwardRef(
    ({ className, children, ...props }, ref) => (
        <SelectPrimitive.Item
            ref={ref}
            className={cn(
                "flex w-full cursor-pointer select-none items-center rounded-md px-3 py-2 text-sm text-foreground outline-none transition-colors duration-150",
                "hover:bg-slate-50 focus:bg-accent focus:text-accent-foreground",
                "data-[state=checked]:bg-accent data-[state=checked]:text-accent-foreground data-[state=checked]:font-semibold",
                "data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
                className
            )}
            {...props}
        >
            <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
        </SelectPrimitive.Item>
    )
);
SelectItem.displayName = SelectPrimitive.Item.displayName;

const SelectSeparator = React.forwardRef(({ className, ...props }, ref) => (
    <SelectPrimitive.Separator
        ref={ref}
        className={cn("mx-3 my-2 h-px bg-border", className)}
        {...props}
    />
));
SelectSeparator.displayName = SelectPrimitive.Separator.displayName;

export {
    Select,
    SelectGroup,
    SelectValue,
    SelectTrigger,
    SelectContent,
    SelectLabel,
    SelectItem,
    SelectSeparator,
    SelectScrollUpButton,
    SelectScrollDownButton,
};
