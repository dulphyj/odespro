import { toast as sonnerToast } from "sonner"

type ToastProps = {
  title?: string
  description?: string
  variant?: "default" | "destructive" | "success"
}

function toast({ title, description, variant = "default" }: ToastProps) {
  const options = {
    description,
    ...(variant === "destructive" && { className: "!bg-destructive !text-destructive-foreground" }),
    ...(variant === "success" && { className: "!bg-emerald-600 !text-white" }),
  }

  return sonnerToast(title, options)
}

export { toast }
export type { ToastProps }
