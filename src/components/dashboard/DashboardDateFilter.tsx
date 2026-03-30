import { memo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { CalendarDays } from "lucide-react";
import { format } from "date-fns";
import { type DateFilterPreset, DATE_FILTER_OPTIONS } from "@/lib/dateFilterUtils";

interface DashboardDateFilterProps {
  datePreset: DateFilterPreset;
  onPresetChange: (v: DateFilterPreset) => void;
  customStart: string;
  customEnd: string;
  onCustomStartChange: (v: string) => void;
  onCustomEndChange: (v: string) => void;
  dateRange: { start: Date; end: Date };
}

export const DashboardDateFilter = memo(function DashboardDateFilter({
  datePreset, onPresetChange, customStart, customEnd, onCustomStartChange, onCustomEndChange, dateRange,
}: DashboardDateFilterProps) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <CalendarDays className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium text-foreground">Período:</span>
          </div>
          <Select value={datePreset} onValueChange={(v) => onPresetChange(v as DateFilterPreset)}>
            <SelectTrigger className="w-[180px] h-8 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DATE_FILTER_OPTIONS.map(opt => (
                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {datePreset === "personalizado" && (
            <>
              <Input type="date" value={customStart} onChange={(e) => onCustomStartChange(e.target.value)} className="w-[150px] h-8 text-sm" />
              <span className="text-xs text-muted-foreground">até</span>
              <Input type="date" value={customEnd} onChange={(e) => onCustomEndChange(e.target.value)} className="w-[150px] h-8 text-sm" />
            </>
          )}
          <span className="text-xs text-muted-foreground ml-auto">
            {format(dateRange.start, "dd/MM/yyyy")} — {format(dateRange.end, "dd/MM/yyyy")}
          </span>
        </div>
      </CardContent>
    </Card>
  );
});
