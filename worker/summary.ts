type Scope = { role: string; client_id: string | null };
type Group = {
  kind: string;
  status: string;
  direction: string;
  total: number;
  amount: number;
};
export async function dashboardSummary(db: D1Database, user: Scope) {
  const scoped = user.role === "client";
  const where = scoped
    ? "archived=0 AND client_id=? AND kind IN ('projects','tasks','finance')"
    : "archived=0";
  const bindings = scoped ? [user.client_id ?? "NO_CLIENT"] : [];
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts();
  const today = ["year", "month", "day"]
    .map((type) => parts.find((p) => p.type === type)?.value)
    .join("-");
  const since = new Date(today.slice(0, 7) + "-01T00:00:00Z");
  since.setUTCMonth(since.getUTCMonth() - 11);
  const reference =
    "COALESCE(NULLIF(json_extract(data,'$.due'),''),substr(created_at,1,10))";
  const [groups, overdue, monthly] = await Promise.all([
    db
      .prepare(
        `SELECT kind,COALESCE(json_extract(data,'$.status'),'') AS status,COALESCE(json_extract(data,'$.direction'),'') AS direction,COUNT(*) AS total,COALESCE(SUM(CASE WHEN kind='finance' THEN json_extract(data,'$.amount_cents') WHEN kind='leads' THEN json_extract(data,'$.value_cents') ELSE 0 END),0) AS amount FROM records WHERE ${where} GROUP BY kind,status,direction`,
      )
      .bind(...bindings)
      .all<Group>(),
    db
      .prepare(
        `SELECT COUNT(*) AS total FROM records WHERE ${where} AND kind='tasks' AND COALESCE(json_extract(data,'$.status'),'')!='Concluída' AND json_extract(data,'$.due')!='' AND json_extract(data,'$.due')<?`,
      )
      .bind(...bindings, today)
      .first<{ total: number }>(),
    db
      .prepare(
        `SELECT substr(${reference},1,7) AS month,json_extract(data,'$.direction') AS direction,json_extract(data,'$.status') AS status,SUM(json_extract(data,'$.amount_cents')) AS amount FROM records WHERE ${where} AND kind='finance' AND json_extract(data,'$.status') IN ('Pago','Pendente') AND ${reference}>=? AND substr(${reference},1,7)<=? GROUP BY month,direction,status ORDER BY month`,
      )
      .bind(...bindings, since.toISOString().slice(0, 10), today.slice(0, 7))
      .all<{
        month: string;
        direction: string;
        status: string;
        amount: number;
      }>(),
  ]);
  const counts: Record<string, number> = {};
  let openProjects = 0,
    openTasks = 0,
    newLeads = 0,
    pipelineValue = 0,
    wonLeads = 0,
    lostLeads = 0;
  const finances = {
    incomePaid: 0,
    expensePaid: 0,
    incomePending: 0,
    expensePending: 0,
    pendingCount: 0,
  };
  const pipeline: { status: string; count: number; value: number }[] = [];
  for (const row of groups.results) {
    counts[row.kind] = (counts[row.kind] ?? 0) + row.total;
    if (row.kind === "projects" && row.status !== "Concluído")
      openProjects += row.total;
    if (row.kind === "tasks" && row.status !== "Concluída")
      openTasks += row.total;
    if (row.kind === "leads") {
      pipeline.push({
        status: row.status,
        count: row.total,
        value: row.amount,
      });
      if (row.status === "Novo contato") newLeads += row.total;
      if (row.status === "Conquistado") wonLeads += row.total;
      else if (row.status === "Sem interesse") lostLeads += row.total;
      else pipelineValue += row.amount;
    }
    if (row.kind === "finance") {
      if (row.status === "Pendente") finances.pendingCount += row.total;
      const key =
        row.direction === "income"
          ? row.status === "Pago"
            ? "incomePaid"
            : row.status === "Pendente"
              ? "incomePending"
              : null
          : row.direction === "expense"
            ? row.status === "Pago"
              ? "expensePaid"
              : row.status === "Pendente"
                ? "expensePending"
                : null
            : null;
      if (key) finances[key] += row.amount;
    }
  }
  const months: Record<
    string,
    {
      month: string;
      incomePaid: number;
      expensePaid: number;
      incomePending: number;
      expensePending: number;
    }
  > = {};
  for (const row of monthly.results) {
    const item = (months[row.month] ??= {
      month: row.month,
      incomePaid: 0,
      expensePaid: 0,
      incomePending: 0,
      expensePending: 0,
    });
    const key =
      row.direction === "income"
        ? row.status === "Pago"
          ? "incomePaid"
          : "incomePending"
        : row.status === "Pago"
          ? "expensePaid"
          : "expensePending";
    item[key] += row.amount;
  }
  return {
    counts,
    openProjects,
    openTasks,
    newLeads,
    pipelineValue,
    wonLeads,
    lostLeads,
    overdueTasks: overdue?.total ?? 0,
    finances,
    pipeline,
    monthly: Object.values(months),
    asOf: today,
  };
}
