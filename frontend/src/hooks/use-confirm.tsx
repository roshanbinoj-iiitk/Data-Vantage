import { useCallback, useState } from "react";
import { ConfirmDialog } from "@/components/ConfirmDialog";

interface ConfirmOptions {
  title: string;
  description: React.ReactNode;
  confirmLabel?: string;
}

// const { confirm, dialog } = useConfirm();
// if (await confirm({ title, description })) { ... }
// Render {dialog} somewhere in the component.
export function useConfirm() {
  const [state, setState] = useState<(ConfirmOptions & { resolve: (ok: boolean) => void }) | null>(null);

  const confirm = useCallback(
    (options: ConfirmOptions) => new Promise<boolean>((resolve) => setState({ ...options, resolve })),
    [],
  );

  const close = useCallback(
    (ok: boolean) => {
      state?.resolve(ok);
      setState(null);
    },
    [state],
  );

  const dialog = (
    <ConfirmDialog
      open={state !== null}
      title={state?.title ?? ""}
      description={state?.description ?? ""}
      confirmLabel={state?.confirmLabel}
      onConfirm={() => close(true)}
      onCancel={() => close(false)}
    />
  );

  return { confirm, dialog };
}
