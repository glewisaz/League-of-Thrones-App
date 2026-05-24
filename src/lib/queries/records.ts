import { createAnonServerClient } from '@/lib/supabase/server';

// Team identification used everywhere in this module. We store the slug
// because it's how franchise pages are linked, and owner_name for display.
type TeamLite = { id: string; owner_name: string; slug: string };

export type SingleGameRecord = {
  team: TeamLite;
  opponent: TeamLite;
  season: number;
  week: number;
  points_for: number;
  points_against: number;
  margin: number;
  is_playoffs: boolean;
};

export type SeasonRecord = {
  team: TeamLite;
  season: number;
  wins: number;
  losses: number;
  ties: number;
  points_for: number;
  points_against: number;
};

export type CareerStat = {
  team: TeamLite;
  seasons: number;
  wins: number;
  losses: number;
  ties: number;
  points_for: number;
  points_against: number;
  win_pct: number;
};

export type StreakRecord = {
  team: TeamLite;
  length: number;
  kind: 'W' | 'L';
  start_season: number;
  start_week: number;
  end_season: number;
  end_week: number;
};

export type SeasonTimelineEntry = {
  season: number;
  champion: TeamLite | null;
  runner_up: TeamLite | null;
  best_regular_season: { team: TeamLite; wins: number; losses: number; ties: number } | null;
  highest_scorer: { team: TeamLite; points_for: number } | null;
  most_points_week: { team: TeamLite; opponent: TeamLite; week: number; points: number } | null;
};

// ---------------------------------------------------------------------------
// Internal: load every team once and index by id, so all the records below
// can be returned with display-ready owner_name + slug without re-querying.
// ---------------------------------------------------------------------------
async function loadTeamIndex(): Promise<Map<string, TeamLite>> {
  const supabase = createAnonServerClient();
  const { data, error } = await supabase
    .from('teams')
    .select('id, owner_name, slug');
  if (error) throw error;
  const map = new Map<string, TeamLite>();
  for (const t of (data ?? []) as TeamLite[]) {
    map.set(t.id, t);
  }
  return map;
}

// ---------------------------------------------------------------------------
// Single-game records (highest score, lowest score, biggest blowout, closest)
// ---------------------------------------------------------------------------
export async function getSingleGameRecords(): Promise<{
  highest_score: SingleGameRecord | null;
  lowest_score: SingleGameRecord | null;
  biggest_blowout: SingleGameRecord | null;
  closest_game: SingleGameRecord | null;
}> {
  const supabase = createAnonServerClient();
  const [teams, { data: matchups, error }] = await Promise.all([
    loadTeamIndex(),
    supabase
      .from('matchups_by_team')
      .select('season, week, team_id, opponent_id, points_for, points_against, is_playoffs, result'),
  ]);
  if (error) throw error;

  const rows = (matchups ?? []) as Array<{
    season: number;
    week: number;
    team_id: string;
    opponent_id: string;
    points_for: number;
    points_against: number;
    is_playoffs: boolean;
    result: 'W' | 'L' | 'T';
  }>;

  if (rows.length === 0) {
    return { highest_score: null, lowest_score: null, biggest_blowout: null, closest_game: null };
  }

  // Walk once, tracking each extreme. Avoids 4 separate sorts.
  let highest = rows[0];
  let lowest = rows[0];
  let blowout = rows[0]; // start with any row, replaced when we see a W
  let closest = rows[0]; // ditto
  let foundBlowout = false;
  let foundClosest = false;

  for (const r of rows) {
    if (Number(r.points_for) > Number(highest.points_for)) highest = r;
    if (Number(r.points_for) < Number(lowest.points_for)) lowest = r;
    if (r.result === 'W') {
      const margin = Number(r.points_for) - Number(r.points_against);
      if (!foundBlowout || margin > Number(blowout.points_for) - Number(blowout.points_against)) {
        blowout = r;
        foundBlowout = true;
      }
      if (margin > 0 && (!foundClosest || margin < Number(closest.points_for) - Number(closest.points_against))) {
        closest = r;
        foundClosest = true;
      }
    }
  }

  const toRecord = (r: typeof rows[number]): SingleGameRecord | null => {
    const team = teams.get(r.team_id);
    const opponent = teams.get(r.opponent_id);
    if (!team || !opponent) return null;
    return {
      team,
      opponent,
      season: r.season,
      week: r.week,
      points_for: Number(r.points_for),
      points_against: Number(r.points_against),
      margin: Number(r.points_for) - Number(r.points_against),
      is_playoffs: r.is_playoffs,
    };
  };

  return {
    highest_score: toRecord(highest),
    lowest_score: toRecord(lowest),
    biggest_blowout: foundBlowout ? toRecord(blowout) : null,
    closest_game: foundClosest ? toRecord(closest) : null,
  };
}

// ---------------------------------------------------------------------------
// Season records (highest PF, best regular-season record)
// ---------------------------------------------------------------------------
export async function getSeasonRecords(limit = 5): Promise<{
  highest_pf: SeasonRecord[];
  best_record: SeasonRecord[];
}> {
  const supabase = createAnonServerClient();
  const [teams, { data, error }] = await Promise.all([
    loadTeamIndex(),
    supabase
      .from('standings')
      .select('team_id, season, wins, losses, ties, points_for, points_against'),
  ]);
  if (error) throw error;

  const rows = ((data ?? []) as Array<{
    team_id: string;
    season: number;
    wins: number;
    losses: number;
    ties: number;
    points_for: number;
    points_against: number;
  }>).flatMap((r) => {
    const team = teams.get(r.team_id);
    return team
      ? [{
          team,
          season: r.season,
          wins: r.wins,
          losses: r.losses,
          ties: r.ties,
          points_for: Number(r.points_for),
          points_against: Number(r.points_against),
        }]
      : [];
  });

  const byPF = [...rows].sort((a, b) => b.points_for - a.points_for).slice(0, limit);
  // Sort by wins, then by points_for as tiebreaker.
  const byRecord = [...rows]
    .sort((a, b) => b.wins - a.wins || b.points_for - a.points_for)
    .slice(0, limit);

  return { highest_pf: byPF, best_record: byRecord };
}

// ---------------------------------------------------------------------------
// Career leaders: total wins, total points, win pct.
// minSeasons floor avoids a 1-season ghost dominating the win-pct chart.
// ---------------------------------------------------------------------------
export async function getCareerLeaders(minSeasons = 2): Promise<{
  most_wins: CareerStat[];
  most_points: CareerStat[];
  best_win_pct: CareerStat[];
}> {
  const supabase = createAnonServerClient();
  const [teams, { data, error }] = await Promise.all([
    loadTeamIndex(),
    supabase
      .from('standings')
      .select('team_id, wins, losses, ties, points_for, points_against'),
  ]);
  if (error) throw error;

  const agg = new Map<string, CareerStat>();
  for (const r of (data ?? []) as Array<{
    team_id: string;
    wins: number;
    losses: number;
    ties: number;
    points_for: number;
    points_against: number;
  }>) {
    const team = teams.get(r.team_id);
    if (!team) continue;
    const cur = agg.get(r.team_id) ?? {
      team,
      seasons: 0,
      wins: 0,
      losses: 0,
      ties: 0,
      points_for: 0,
      points_against: 0,
      win_pct: 0,
    };
    cur.seasons += 1;
    cur.wins += r.wins;
    cur.losses += r.losses;
    cur.ties += r.ties;
    cur.points_for += Number(r.points_for);
    cur.points_against += Number(r.points_against);
    agg.set(r.team_id, cur);
  }

  const all = [...agg.values()].map((s) => {
    const games = s.wins + s.losses + s.ties;
    s.win_pct = games === 0 ? 0 : (s.wins + s.ties * 0.5) / games;
    return s;
  });

  const eligible = all.filter((s) => s.seasons >= minSeasons);

  return {
    most_wins: [...all].sort((a, b) => b.wins - a.wins).slice(0, 10),
    most_points: [...all].sort((a, b) => b.points_for - a.points_for).slice(0, 10),
    best_win_pct: [...eligible].sort((a, b) => b.win_pct - a.win_pct).slice(0, 10),
  };
}

// ---------------------------------------------------------------------------
// Longest win and loss streaks. Walks each team's matchups chronologically
// (season ASC, week ASC) and tracks runs of same result. Ties break a streak.
// ---------------------------------------------------------------------------
export async function getLongestStreaks(): Promise<{
  longest_win: StreakRecord | null;
  longest_loss: StreakRecord | null;
}> {
  const supabase = createAnonServerClient();
  const [teams, { data, error }] = await Promise.all([
    loadTeamIndex(),
    supabase
      .from('matchups_by_team')
      .select('team_id, season, week, result')
      .order('team_id')
      .order('season')
      .order('week'),
  ]);
  if (error) throw error;

  const rows = (data ?? []) as Array<{
    team_id: string;
    season: number;
    week: number;
    result: 'W' | 'L' | 'T';
  }>;

  let longestW: StreakRecord | null = null;
  let longestL: StreakRecord | null = null;

  type Run = {
    teamId: string;
    kind: 'W' | 'L';
    length: number;
    startSeason: number;
    startWeek: number;
    endSeason: number;
    endWeek: number;
  };
  let current: Run | null = null;
  let currentTeam: string | null = null;

  const commit = () => {
    if (!current) return;
    const team = teams.get(current.teamId);
    if (!team) return;
    const rec: StreakRecord = {
      team,
      length: current.length,
      kind: current.kind,
      start_season: current.startSeason,
      start_week: current.startWeek,
      end_season: current.endSeason,
      end_week: current.endWeek,
    };
    if (current.kind === 'W' && (!longestW || rec.length > longestW.length)) longestW = rec;
    if (current.kind === 'L' && (!longestL || rec.length > longestL.length)) longestL = rec;
  };

  for (const r of rows) {
    if (r.team_id !== currentTeam) {
      commit();
      current = null;
      currentTeam = r.team_id;
    }
    if (r.result === 'T') {
      commit();
      current = null;
      continue;
    }
    if (current && current.kind === r.result) {
      current.length++;
      current.endSeason = r.season;
      current.endWeek = r.week;
    } else {
      commit();
      current = {
        teamId: r.team_id,
        kind: r.result,
        length: 1,
        startSeason: r.season,
        startWeek: r.week,
        endSeason: r.season,
        endWeek: r.week,
      };
    }
  }
  commit();

  return { longest_win: longestW, longest_loss: longestL };
}

// ---------------------------------------------------------------------------
// Season-by-season highlights: champion, runner-up, best regular-season,
// highest scorer (season PF), highest-scoring week.
// ---------------------------------------------------------------------------
export async function getSeasonTimeline(): Promise<SeasonTimelineEntry[]> {
  const supabase = createAnonServerClient();
  const [teams, seasonsRes, standingsRes, championsRes, matchupsRes] = await Promise.all([
    loadTeamIndex(),
    supabase.from('seasons').select('year').order('year', { ascending: false }),
    supabase.from('standings').select('team_id, season, wins, losses, ties, points_for'),
    supabase
      .from('champions')
      .select('season, champion_team_id, runner_up_team_id'),
    supabase
      .from('matchups_by_team')
      .select('team_id, opponent_id, season, week, points_for'),
  ]);
  if (standingsRes.error) throw standingsRes.error;
  if (championsRes.error) throw championsRes.error;
  if (matchupsRes.error) throw matchupsRes.error;

  const standings = (standingsRes.data ?? []) as Array<{
    team_id: string;
    season: number;
    wins: number;
    losses: number;
    ties: number;
    points_for: number;
  }>;
  const champions = (championsRes.data ?? []) as Array<{
    season: number;
    champion_team_id: string | null;
    runner_up_team_id: string | null;
  }>;
  const matchupRows = (matchupsRes.data ?? []) as Array<{
    team_id: string;
    opponent_id: string;
    season: number;
    week: number;
    points_for: number;
  }>;

  const championBySeason = new Map(champions.map((c) => [c.season, c]));

  const seasons = ((seasonsRes.data ?? []) as { year: number }[]).map((s) => s.year);

  return seasons
    .map((season): SeasonTimelineEntry | null => {
      const seasonStandings = standings.filter((s) => s.season === season);
      const seasonMatchups = matchupRows.filter((m) => m.season === season);

      const champEntry = championBySeason.get(season);
      const champion =
        champEntry?.champion_team_id ? (teams.get(champEntry.champion_team_id) ?? null) : null;
      const runnerUp =
        champEntry?.runner_up_team_id ? (teams.get(champEntry.runner_up_team_id) ?? null) : null;

      const bestRecordRow = seasonStandings.length === 0
        ? null
        : [...seasonStandings].sort(
            (a, b) => b.wins - a.wins || Number(b.points_for) - Number(a.points_for),
          )[0];
      const bestRecordTeam = bestRecordRow ? teams.get(bestRecordRow.team_id) ?? null : null;

      const highestPFRow = seasonStandings.length === 0
        ? null
        : [...seasonStandings].sort((a, b) => Number(b.points_for) - Number(a.points_for))[0];
      const highestScorerTeam = highestPFRow ? teams.get(highestPFRow.team_id) ?? null : null;

      const topWeek = seasonMatchups.length === 0
        ? null
        : [...seasonMatchups].sort((a, b) => Number(b.points_for) - Number(a.points_for))[0];
      const topWeekTeam = topWeek ? teams.get(topWeek.team_id) ?? null : null;
      const topWeekOpponent = topWeek ? teams.get(topWeek.opponent_id) ?? null : null;

      // Skip seasons with no data at all to avoid empty timeline rows.
      if (!champion && !bestRecordTeam && !highestScorerTeam && !topWeekTeam) return null;

      return {
        season,
        champion,
        runner_up: runnerUp,
        best_regular_season:
          bestRecordTeam && bestRecordRow
            ? {
                team: bestRecordTeam,
                wins: bestRecordRow.wins,
                losses: bestRecordRow.losses,
                ties: bestRecordRow.ties,
              }
            : null,
        highest_scorer:
          highestScorerTeam && highestPFRow
            ? { team: highestScorerTeam, points_for: Number(highestPFRow.points_for) }
            : null,
        most_points_week:
          topWeekTeam && topWeekOpponent && topWeek
            ? {
                team: topWeekTeam,
                opponent: topWeekOpponent,
                week: topWeek.week,
                points: Number(topWeek.points_for),
              }
            : null,
      };
    })
    .filter((e): e is SeasonTimelineEntry => e != null);
}
