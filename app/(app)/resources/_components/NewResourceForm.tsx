"use client";

import { ResourceForm } from "./ResourceForm";

export function NewResourceForm() {
  return <ResourceForm mode={{ kind: "create" }} />;
}
