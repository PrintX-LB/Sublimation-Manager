import type { ReactNode } from "react";
import { PageHeading } from "./page-heading";
import { BackNavigation } from "./back-navigation";

interface WorkflowHeaderProps {
  title: string;
  description: string;
  backLabel: string;
  fallbackRoute: string;
  actions?: ReactNode;
  returnTo?: string;
}

export function WorkflowHeader({
  title,
  description,
  backLabel,
  fallbackRoute,
  actions,
  returnTo,
}: WorkflowHeaderProps) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <BackNavigation label={backLabel} fallbackRoute={fallbackRoute} returnTo={returnTo} />
        <PageHeading title={title} description={description} />
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}
