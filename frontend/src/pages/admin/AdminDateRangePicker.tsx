import React, { useEffect, useMemo, useRef, useState } from "react";

type AdminDateRangePickerProps = {
  start: string;
  end: string;
  onChange: (start: string, end: string) => void;
};

const WEEKDAYS = ["日", "一", "二", "三", "四", "五", "六"];

function atStartOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function parseDate(value: string): Date | null {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

function formatDateValue(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDateLabel(value: string): string {
  return value.replace(/-/g, "/");
}

const AdminDateRangePicker: React.FC<AdminDateRangePickerProps> = ({ start, end, onChange }) => {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const today = useMemo(() => atStartOfDay(new Date()), []);
  const [open, setOpen] = useState(false);
  const [visibleMonth, setVisibleMonth] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));
  const [draftStart, setDraftStart] = useState(start);
  const [draftEnd, setDraftEnd] = useState(end);
  const [selectingEnd, setSelectingEnd] = useState(false);

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  const openPicker = () => {
    if (!open) {
      const selected = parseDate(end || start) || today;
      setVisibleMonth(new Date(selected.getFullYear(), selected.getMonth(), 1));
      setDraftStart(start);
      setDraftEnd(end);
      setSelectingEnd(false);
    }
    setOpen((current) => !current);
  };

  const applyRange = (nextStart: Date, nextEnd: Date) => {
    const startValue = formatDateValue(nextStart);
    const endValue = formatDateValue(nextEnd);
    setDraftStart(startValue);
    setDraftEnd(endValue);
    setSelectingEnd(false);
    onChange(startValue, endValue);
    setOpen(false);
  };

  const quickRanges = [
    { label: "今天", start: today, end: today },
    { label: "近 7 天", start: addDays(today, -6), end: today },
    { label: "近 30 天", start: addDays(today, -29), end: today },
    { label: "本月", start: new Date(today.getFullYear(), today.getMonth(), 1), end: today },
  ];

  const monthDays = useMemo(() => {
    const monthStart = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth(), 1);
    const gridStart = addDays(monthStart, -monthStart.getDay());
    return Array.from({ length: 42 }, (_, index) => addDays(gridStart, index));
  }, [visibleMonth]);

  const draftStartDate = parseDate(draftStart);
  const draftEndDate = parseDate(draftEnd);
  const triggerLabel = start && end
    ? start === end ? formatDateLabel(start) : `${formatDateLabel(start)} – ${formatDateLabel(end)}`
    : start ? `${formatDateLabel(start)} 起`
      : end ? `截至 ${formatDateLabel(end)}`
        : "全部日期";

  const handleDayClick = (date: Date) => {
    const value = formatDateValue(date);
    if (!selectingEnd || !draftStartDate || draftEndDate) {
      setDraftStart(value);
      setDraftEnd("");
      setSelectingEnd(true);
      return;
    }
    if (date.getTime() < draftStartDate.getTime()) applyRange(date, draftStartDate);
    else applyRange(draftStartDate, date);
  };

  const clearRange = () => {
    setDraftStart("");
    setDraftEnd("");
    setSelectingEnd(false);
    onChange("", "");
  };

  return (
    <div ref={rootRef} className="relative w-[320px] max-w-full">
      <div className="mb-1.5 text-[10px] font-black uppercase tracking-[0.18em] text-stone-500">注册日期</div>
      <button
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label="注册日期范围"
        className={`flex w-full items-center gap-2 rounded-xl border bg-white px-3 py-2.5 text-left text-sm font-bold transition-all ${open ? "border-[#5e17eb] ring-4 ring-[#5e17eb]/5" : "border-stone-200 hover:border-[#5e17eb]/50"}`}
        type="button"
        onClick={openPicker}
      >
        <span className="material-symbols-outlined text-lg text-[#5e17eb]">calendar_month</span>
        <span className={`min-w-0 flex-1 truncate ${start || end ? "text-stone-900" : "text-stone-500"}`}>{triggerLabel}</span>
        <span className={`material-symbols-outlined text-lg text-stone-400 transition-transform ${open ? "rotate-180" : ""}`}>expand_more</span>
      </button>

      {open ? (
        <div
          aria-label="选择注册日期范围"
          className="absolute right-0 top-[calc(100%+8px)] z-50 w-[360px] max-w-[calc(100vw-3rem)] rounded-2xl border border-stone-200 bg-white p-4 shadow-[0_24px_64px_rgba(42,25,74,0.18)]"
          role="dialog"
        >
          <div className="grid grid-cols-4 gap-1.5">
            {quickRanges.map((range) => (
              <button
                key={range.label}
                className="rounded-lg border border-stone-200 px-2 py-2 text-xs font-bold text-stone-700 transition-colors hover:border-[#5e17eb]/40 hover:bg-[#f7f3ff] hover:text-[#5e17eb]"
                type="button"
                onClick={() => applyRange(range.start, range.end)}
              >
                {range.label}
              </button>
            ))}
          </div>

          <div className="mt-4 flex items-center justify-between">
            <button
              aria-label="上个月"
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-stone-200 text-stone-600 transition-colors hover:border-[#5e17eb]/40 hover:text-[#5e17eb]"
              type="button"
              onClick={() => setVisibleMonth((month) => new Date(month.getFullYear(), month.getMonth() - 1, 1))}
            >
              <span className="material-symbols-outlined text-lg">chevron_left</span>
            </button>
            <div className="text-sm font-black tracking-[0.08em] text-stone-900">
              {visibleMonth.getFullYear()} 年 {visibleMonth.getMonth() + 1} 月
            </div>
            <button
              aria-label="下个月"
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-stone-200 text-stone-600 transition-colors hover:border-[#5e17eb]/40 hover:text-[#5e17eb]"
              type="button"
              onClick={() => setVisibleMonth((month) => new Date(month.getFullYear(), month.getMonth() + 1, 1))}
            >
              <span className="material-symbols-outlined text-lg">chevron_right</span>
            </button>
          </div>

          <div className="mt-3 grid grid-cols-7 gap-1 text-center">
            {WEEKDAYS.map((weekday) => <div key={weekday} className="py-1 text-[10px] font-black text-stone-400">{weekday}</div>)}
            {monthDays.map((date) => {
              const value = formatDateValue(date);
              const timestamp = date.getTime();
              const isCurrentMonth = date.getMonth() === visibleMonth.getMonth();
              const isToday = timestamp === today.getTime();
              const isStart = value === draftStart;
              const isEnd = value === draftEnd;
              const isInsideRange = Boolean(draftStartDate && draftEndDate && timestamp > draftStartDate.getTime() && timestamp < draftEndDate.getTime());
              const isRangeEdge = isStart || isEnd;
              return (
                <button
                  key={value}
                  aria-label={`${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`}
                  aria-pressed={isRangeEdge || isInsideRange}
                  className={`relative flex h-9 items-center justify-center rounded-lg text-xs font-bold transition-colors ${
                    isRangeEdge
                      ? "bg-[#5e17eb] text-white shadow-sm"
                      : isInsideRange
                        ? "bg-[#f1eaff] text-[#5e17eb]"
                        : isCurrentMonth
                          ? "text-stone-800 hover:bg-[#f7f3ff] hover:text-[#5e17eb]"
                          : "text-stone-300 hover:bg-stone-50"
                  } ${isToday && !isRangeEdge ? "ring-1 ring-inset ring-[#5e17eb]/60" : ""}`}
                  type="button"
                  onClick={() => handleDayClick(date)}
                >
                  {date.getDate()}
                </button>
              );
            })}
          </div>

          <div className="mt-4 flex items-center justify-between border-t border-stone-100 pt-3">
            <button className="text-xs font-black text-[#5e17eb] hover:text-[#4610b4]" type="button" onClick={clearRange}>清除</button>
            <span className="text-[11px] font-medium text-stone-400">
              {selectingEnd ? "请选择结束日期" : "先选开始日期，再选结束日期"}
            </span>
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default AdminDateRangePicker;
