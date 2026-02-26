import CompatibilityReport from '@/lib/models/CompatibilityReport';
import Agent from '@/lib/models/Agent';
import Student from '@/lib/models/Student';

interface Edge {
  agentA: string;
  agentB: string;
  score: number;
  mutual: boolean;
  dimensions: {
    skillsComplementarity: number;
    interestAlignment: number;
    workStyleFit: number;
    communicationQuality: number;
  };
}

export async function computeMatches(targetTeamSize = { min: 2, max: 4 }) {
  // Get all compatibility reports
  const reports = await CompatibilityReport.find().lean();

  if (reports.length === 0) return [];

  // Build compatibility graph: edges between agents
  const edgeMap = new Map<string, Edge>();

  for (const report of reports) {
    const key = [report.reporterAgentId.toString(), report.aboutAgentId.toString()].sort().join('-');

    if (!edgeMap.has(key)) {
      edgeMap.set(key, {
        agentA: report.reporterAgentId.toString(),
        agentB: report.aboutAgentId.toString(),
        score: report.overallScore,
        mutual: false,
        dimensions: { ...report.dimensions },
      });
    } else {
      const edge = edgeMap.get(key)!;
      // Average the scores from both sides
      edge.score = Math.round((edge.score + report.overallScore) / 2);
      edge.mutual = true;
      edge.dimensions = {
        skillsComplementarity: Math.round((edge.dimensions.skillsComplementarity + report.dimensions.skillsComplementarity) / 2),
        interestAlignment: Math.round((edge.dimensions.interestAlignment + report.dimensions.interestAlignment) / 2),
        workStyleFit: Math.round((edge.dimensions.workStyleFit + report.dimensions.workStyleFit) / 2),
        communicationQuality: Math.round((edge.dimensions.communicationQuality + report.dimensions.communicationQuality) / 2),
      };
    }
  }

  // Get all unique agents from reports
  const agentIds = new Set<string>();
  for (const report of reports) {
    agentIds.add(report.reporterAgentId.toString());
    agentIds.add(report.aboutAgentId.toString());
  }

  // Sort edges by score (highest first)
  const edges = Array.from(edgeMap.values())
    .filter(e => e.mutual && e.score >= 40) // Only consider mutual reports with decent scores
    .sort((a, b) => b.score - a.score);

  // Greedy team formation
  const assigned = new Set<string>();
  const teams: Array<{
    members: string[];
    teamScore: number;
    reasoning: string;
    dimensionScores: Edge['dimensions'];
  }> = [];

  for (const edge of edges) {
    if (assigned.has(edge.agentA) || assigned.has(edge.agentB)) continue;

    // Start a team with this pair
    const team = [edge.agentA, edge.agentB];
    let teamScore = edge.score;
    let dims = { ...edge.dimensions };
    let pairCount = 1;

    // Try to grow the team
    for (const candidateEdge of edges) {
      if (team.length >= targetTeamSize.max) break;

      const candidate = team.includes(candidateEdge.agentA) && !assigned.has(candidateEdge.agentB)
        ? candidateEdge.agentB
        : team.includes(candidateEdge.agentB) && !assigned.has(candidateEdge.agentA)
          ? candidateEdge.agentA
          : null;

      if (!candidate || team.includes(candidate)) continue;

      team.push(candidate);
      teamScore = Math.round((teamScore * pairCount + candidateEdge.score) / (pairCount + 1));
      pairCount++;
      dims = {
        skillsComplementarity: Math.round((dims.skillsComplementarity + candidateEdge.dimensions.skillsComplementarity) / 2),
        interestAlignment: Math.round((dims.interestAlignment + candidateEdge.dimensions.interestAlignment) / 2),
        workStyleFit: Math.round((dims.workStyleFit + candidateEdge.dimensions.workStyleFit) / 2),
        communicationQuality: Math.round((dims.communicationQuality + candidateEdge.dimensions.communicationQuality) / 2),
      };
    }

    if (team.length >= targetTeamSize.min) {
      team.forEach(id => assigned.add(id));
      teams.push({
        members: team,
        teamScore,
        reasoning: `Matched based on ${pairCount} compatibility reports with average score ${teamScore}/100.`,
        dimensionScores: dims,
      });
    }
  }

  // Handle unassigned agents - pair remaining ones
  const unassigned = Array.from(agentIds).filter(id => !assigned.has(id));
  for (let i = 0; i < unassigned.length; i += targetTeamSize.min) {
    const remaining = unassigned.slice(i, i + targetTeamSize.max);
    if (remaining.length >= targetTeamSize.min) {
      teams.push({
        members: remaining,
        teamScore: 50,
        reasoning: 'Grouped from remaining unmatched participants.',
        dimensionScores: { skillsComplementarity: 50, interestAlignment: 50, workStyleFit: 50, communicationQuality: 50 },
      });
    }
  }

  return teams;
}
