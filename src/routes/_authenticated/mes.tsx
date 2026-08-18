import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/mes")({
  beforeLoad: () => {
    throw redirect({ to: "/semana", search: { view: "mes" }, replace: true });
  },
});
