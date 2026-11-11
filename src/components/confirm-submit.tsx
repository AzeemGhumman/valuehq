'use client';

import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';

// Opens a confirmation dialog, then submits the form with id `formId`
// (optionally to a different server action via `formAction`).
export function ConfirmSubmit({
  formId, title, description, confirmLabel = 'Delete', children, variant = 'outline', size = 'default', formAction,
}: {
  formId: string;
  title: string;
  description?: string;
  confirmLabel?: string;
  children: React.ReactNode;
  variant?: 'outline' | 'ghost' | 'destructive';
  size?: 'default' | 'sm';
  formAction?: (fd: FormData) => void | Promise<void>;
}) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button type="button" variant={variant} size={size}>{children}</Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          {description && <AlertDialogDescription>{description}</AlertDialogDescription>}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction type="submit" form={formId} formAction={formAction}>{confirmLabel}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
