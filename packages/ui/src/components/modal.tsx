'use client';

import * as React from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { cn } from '../lib/utils';

// React 19 tightened JSX element return types while Radix's `React.FC<...>`
// signature widened to `ReactNode | Promise<ReactNode>`. Under strict
// typechecking, consumers hit TS2786 ("cannot be used as a JSX component")
// when they compose these primitives across package boundaries — especially
// when the monorepo transitively exposes both `@types/react@18` (from the
// React Native app) and `@types/react@19`, because tsc then merges their
// ambient `React` namespaces and picks the stricter 18-era JSX element
// signature. We cast the primitive components to a JSX element type shape
// that is compatible with BOTH React 18 and React 19 type definitions, so
// downstream apps compile cleanly regardless of which copy of @types/react
// they resolve at typecheck time.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type JSXComponent<P> = (props: P, deprecatedLegacyContext?: any) => any;

const Dialog = DialogPrimitive.Root as unknown as JSXComponent<
  React.ComponentProps<typeof DialogPrimitive.Root>
>;
const DialogTrigger = DialogPrimitive.Trigger as unknown as JSXComponent<
  React.ComponentProps<typeof DialogPrimitive.Trigger>
>;
const DialogPortal = DialogPrimitive.Portal as unknown as JSXComponent<
  React.ComponentProps<typeof DialogPrimitive.Portal>
>;
const DialogClose = DialogPrimitive.Close as unknown as JSXComponent<
  React.ComponentProps<typeof DialogPrimitive.Close>
>;

type DialogOverlayProps = React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>;
type DialogOverlayRef = React.ComponentRef<typeof DialogPrimitive.Overlay>;

const DialogOverlayInner = React.forwardRef<DialogOverlayRef, DialogOverlayProps>(
  ({ className, ...props }, ref) => (
    <DialogPrimitive.Overlay
      ref={ref}
      className={cn(
        'fixed inset-0 z-50 bg-black/80 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
        className,
      )}
      {...props}
    />
  ),
);
DialogOverlayInner.displayName = 'DialogOverlay';
const DialogOverlay = DialogOverlayInner as unknown as JSXComponent<
  DialogOverlayProps & React.RefAttributes<DialogOverlayRef>
>;

type DialogContentProps = React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & {
  /**
   * Optional accessible description for the dialog. Rendered visually hidden
   * (sr-only) so the layout is unchanged. For a visible description, use
   * `DialogDescription` inside the content instead. Pass one or the other,
   * not both.
   */
  description?: React.ReactNode;
};
type DialogContentRef = React.ComponentRef<typeof DialogPrimitive.Content>;

// Lets a DialogDescription rendered inside DialogContent tell its content that
// a description element exists, so the content can link to it.
const DialogDescriptionPresenceContext = React.createContext<
  ((present: boolean) => void) | null
>(null);

const DialogContentInner = React.forwardRef<DialogContentRef, DialogContentProps>(
  ({ className, children, description, ...props }, ref) => {
    const [hasDescriptionChild, setHasDescriptionChild] = React.useState(false);
    const callerDescribedBy = props['aria-describedby'];
    const hasDescription = description !== undefined || hasDescriptionChild;

    // Radix links the content to its description via aria-describedby and warns
    // when that id has no element. If there is no description at all, remove
    // the link (nothing to describe) so no warning is raised.
    const describedByProps: { 'aria-describedby'?: string } | { 'aria-describedby': undefined } =
      callerDescribedBy !== undefined || hasDescription
        ? {}
        : { 'aria-describedby': undefined };

    return (
      <DialogPortal>
        <DialogOverlay />
        <DialogDescriptionPresenceContext.Provider value={setHasDescriptionChild}>
          <DialogPrimitive.Content
            ref={ref}
            className={cn(
              'fixed left-[50%] top-[50%] z-50 grid w-full max-w-lg translate-x-[-50%] translate-y-[-50%] gap-4 border bg-background p-6 shadow-lg duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%] sm:rounded-lg',
              className,
            )}
            {...props}
            {...describedByProps}
          >
            {description !== undefined && (
              <DialogPrimitive.Description className="sr-only">{description}</DialogPrimitive.Description>
            )}
            {children}
            <DialogPrimitive.Close className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground">
              <X className="h-4 w-4" />
              <span className="sr-only">Close</span>
            </DialogPrimitive.Close>
          </DialogPrimitive.Content>
        </DialogDescriptionPresenceContext.Provider>
      </DialogPortal>
    );
  },
);
DialogContentInner.displayName = 'DialogContent';
const DialogContent = DialogContentInner as unknown as JSXComponent<
  DialogContentProps & React.RefAttributes<DialogContentRef>
>;

function DialogHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('flex flex-col space-y-1.5 text-center sm:text-left', className)} {...props} />;
}

function DialogFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2', className)} {...props} />;
}

// Radix's Dialog.Title supplies the id that names the dialog (aria-labelledby).
const DialogTitle = React.forwardRef<
  HTMLHeadingElement,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn('text-lg font-semibold leading-none tracking-tight', className)}
    {...props}
  />
));
DialogTitle.displayName = 'DialogTitle';

// Radix's Dialog.Description is what links the dialog to its description via
// aria-describedby. Using it (instead of a plain <p>) is what makes the
// description reachable by screen readers.
const DialogDescription = React.forwardRef<
  HTMLParagraphElement,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => {
  const register = React.useContext(DialogDescriptionPresenceContext);
  React.useLayoutEffect(() => {
    register?.(true);
    return () => register?.(false);
  }, [register]);
  return (
    <DialogPrimitive.Description
      ref={ref}
      className={cn('text-sm text-muted-foreground', className)}
      {...props}
    />
  );
});
DialogDescription.displayName = 'DialogDescription';

// ─── Confirmation Modal ────────────────────────────────────────

interface ConfirmModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'default' | 'destructive';
  onConfirm: () => void;
  isLoading?: boolean;
}

function ConfirmModal({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'default',
  onConfirm,
  isLoading = false,
}: ConfirmModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <button
            onClick={() => onOpenChange(false)}
            className="inline-flex h-9 items-center justify-center rounded-md border px-4 text-sm font-medium transition-colors hover:bg-accent"
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            disabled={isLoading}
            className={cn(
              'inline-flex h-9 items-center justify-center rounded-md px-4 text-sm font-medium transition-colors disabled:opacity-50',
              variant === 'destructive'
                ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90'
                : 'bg-primary text-primary-foreground hover:bg-primary/90',
            )}
          >
            {isLoading ? 'Loading...' : confirmLabel}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
  DialogClose,
  ConfirmModal,
};
