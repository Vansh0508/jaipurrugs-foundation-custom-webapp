import { notFound } from "next/navigation";
import { Chip } from "@heroui/react";
import { getFormMetricsData } from "@/lib/actions/submissions";
import { FormNavTabs } from "@/components/admin/field-editor/form-nav-tabs";
import { MetricsSummaryCards } from "@/components/admin/metrics/metrics-summary-cards";
import { DropoffFunnel } from "@/components/admin/metrics/dropoff-funnel";
import { FieldMetricCard } from "@/components/admin/metrics/field-metric-card";

const STATUS_COLOR = {
  draft: "default",
  published: "success",
  archived: "warning",
} as const;

export default async function FormMetricsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let data;
  try {
    data = await getFormMetricsData(id);
  } catch {
    notFound();
  }

  if (!data?.form) {
    notFound();
  }

  return (
    <div className="flex flex-col gap-6 p-8">
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-semibold">{data.form.title}</h1>
          <Chip color={STATUS_COLOR[data.form.status as keyof typeof STATUS_COLOR] || "default"} size="sm">
            {data.form.status}
          </Chip>
        </div>
        <FormNavTabs formId={data.form.id} />
      </div>

      {/* KPI Summary Cards */}
      <MetricsSummaryCards summary={data.summary} />

      {/* Drop-off Funnel Chart */}
      <DropoffFunnel
        fields={data.fields}
        submissions={data.submissions}
        answers={data.answers}
      />

      {/* Per-field Metric Cards */}
      <div className="flex flex-col gap-4">
        <h2 className="text-base font-bold text-foreground">Field Insights & Responses</h2>
        {data.fields.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border p-8 text-center text-muted">
            No fields created in this form yet.
          </div>
        ) : (
          data.fields.map((field, idx) => (
            <FieldMetricCard
              key={field.id}
              field={field}
              fieldIndex={idx}
              totalSubmissions={data.summary.totalSubmissions}
              answers={data.answers as any}
            />
          ))
        )}
      </div>
    </div>
  );
}
