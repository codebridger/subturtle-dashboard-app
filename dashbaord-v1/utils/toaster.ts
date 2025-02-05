import type { NinjaToasterInstance } from "@cssninja/nuxt-toaster";

const toaster = ref<NinjaToasterInstance | null>(null);

export function getToaster() {
  if (!toaster.value) {
    toaster.value = createNinjaToaster();
  }

  return toaster.value;
}

export function toastError({
  title = "Error",
  message = "An error occurred",
  closable = true,
}: {
  title?: string;
  message?: string;
  closable?: boolean;
}) {
  getToaster().showComponent("TairoToaster", {
    props: {
      title,
      message,
      color: "danger",
      closable,
    },
  });
}

export function toastSuccess({
  title = "Success",
  message = "Action completed successfully",
  closable = true,
}: {
  title?: string;
  message?: string;
  closable?: boolean;
}) {
  getToaster().showComponent("TairoToaster", {
    props: {
      title,
      message,
      color: "success",
      closable,
    },
  });
}
