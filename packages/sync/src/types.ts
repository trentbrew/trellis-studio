export type Criterion = { id: string; status: string; description: string }

export type TrellisIssue = {
  id: string
  title: string
  status: string
  priority: string
  labels: string[]
  criteria: Criterion[]
}

export type ExternalRef = { id: string; url: string }

export interface TrackerAdapter {
  name: string
  create(issue: TrellisIssue, description?: string): Promise<ExternalRef>
  update(id: string, issue: TrellisIssue, description?: string): Promise<void>
  close(id: string): Promise<void>
  comment(id: string, body: string): Promise<void>
}
