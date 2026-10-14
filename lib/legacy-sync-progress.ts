import { readFileSync, renameSync, writeFileSync } from "node:fs";

export type LegacyProgress = {
  sourcePath: string;
  status: "processing" | "completed" | "failed";
  phase: string;
  label: string;
  percent: number;
  processed: number;
  total: number;
  unit: string;
  startedAt: string;
  updatedAt: string;
};

export class LegacyProgressReporter {
  private value: LegacyProgress;
  private lastWrite = 0;
  constructor(private path: string | undefined, sourcePath: string) {
    let startedAt = new Date().toISOString();
    if (path) {
      try {
        const previous = JSON.parse(readFileSync(path, "utf8").replace(/^\uFEFF/, "")) as LegacyProgress;
        if (previous.sourcePath === sourcePath && previous.status === "processing") startedAt = previous.startedAt;
      } catch { /* No previous export progress. */ }
    }
    this.value = { sourcePath, status: "processing", phase: "prepare", label: "ตรวจสอบข้อมูลก่อนนำเข้า", percent: 30, processed: 0, total: 0, unit: "รายการ", startedAt, updatedAt: startedAt };
  }
  private write(force = false) {
    if (!this.path || !force && Date.now() - this.lastWrite < 250) return;
    this.lastWrite = Date.now();
    this.value.updatedAt = new Date().toISOString();
    const temporary = `${this.path}.${process.pid}.tmp`;
    writeFileSync(temporary, JSON.stringify(this.value), "utf8");
    renameSync(temporary, this.path);
  }
  stage(phase: string, label: string, start: number, end: number, total = 0, unit = "รายการ") {
    let processed = 0;
    this.value = { ...this.value, status: "processing", phase, label, percent: start, processed, total, unit };
    this.write(true);
    return (count = 1) => {
      processed = Math.min(total, processed + count);
      this.value = { ...this.value, processed, percent: total > 0 ? start + (end - start) * processed / total : end };
      this.write(processed >= total);
    };
  }
  complete() {
    this.value = { ...this.value, status: "completed", phase: "completed", label: "นำเข้าข้อมูลเรียบร้อย", percent: 100 };
    this.write(true);
  }
  fail(message: string) {
    this.value = { ...this.value, status: "failed", label: message };
    this.write(true);
  }
}
