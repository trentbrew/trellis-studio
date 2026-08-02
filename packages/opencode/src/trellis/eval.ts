// Local evaluation functions for trellis
// These are not provided by the external trellis package

export function summary(decisions: any[], issues: any[], _ops: any[], gardenTotal: number) {
  return {
    totalDecisions: decisions.length,
    avgDecisionQuality: 1.0,
    totalIssues: issues.length,
    avgIssueHealth: 1.0,
    totalSessions: 0,
    avgSessionEfficiency: 1.0,
    topAgent: null as string | null,
    worstIssue: null as string | null,
    gardenClusters: gardenTotal,
  }
}

export function agentReport(agentId: string, decisions: any[], _issues: any[], _ops: any[]) {
  return {
    agent: agentId,
    decisions: decisions.length,
    avgQuality: 1.0,
    toolDistribution: {} as Record<string, number>,
    issuesClosed: 0,
    issuesReopened: 0,
    avgCriteriaRate: 1.0,
    sessions: 0,
    avgSessionEfficiency: 1.0,
  }
}

export function sessionReport(sessionId: string, decisions: any[], _issues: any[], _ops: any[]) {
  return {
    session: sessionId,
    efficiency: {
      session: sessionId,
      efficiency: 1.0,
      metrics: { density: 1, diversity: 1, progress: 1, backtrack: 0 },
      decisions: decisions.length,
      issues: [] as string[],
    },
    decisions: [] as Array<{
      id: string
      quality: number
      signals: {
        output: number
        resolved: number
        notReverted: number
        convergence: number
        rationale: number
      }
    }>,
  }
}

export function scoreIssue(issue: any, chain: any[], _ops: any[]) {
  return {
    id: issue.id,
    health: 1.0,
    metrics: {
      timeToClose: null as number | null,
      criteriaRate: 1.0,
      reopens: 0,
      blocks: 0,
      chainLength: chain.length,
      pauses: 0,
    },
  }
}
