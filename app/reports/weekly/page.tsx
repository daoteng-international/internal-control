"use client";

import { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";

function toJsDate(value: any): Date | null {
  if (!value) return null;

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  if (typeof value?.toDate === "function") {
    const date = value.toDate();
    return Number.isNaN(date.getTime()) ? null : date;
  }

  if (typeof value === "string") {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  return null;
}

function getStartOfWeek(date: Date) {
  const result = new Date(date);
  const day = result.getDay();

  // 星期一作為每週第一天
  const diff = day === 0 ? -6 : 1 - day;

  result.setDate(result.getDate() + diff);
  result.setHours(0, 0, 0, 0);

  return result;
}

function getEndOfWeek(date: Date) {
  const end = getStartOfWeek(date);

  // 下週一 00:00
  end.setDate(end.getDate() + 7);

  return end;
}

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("zh-TW", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function formatDateValue(value: any) {
  const date = toJsDate(value);

  if (!date) {
    return "-";
  }

  return formatDate(date);
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("zh-TW", {
    style: "currency",
    currency: "TWD",
    maximumFractionDigits: 0,
  }).format(value || 0);
}

function isDateInRange(
  value: any,
  startDate: Date,
  endDate: Date
) {
  const date = toJsDate(value);

  return (
    date !== null &&
    date >= startDate &&
    date < endDate
  );
}

function getAmount(item: any) {
  const amount = Number(item.totalContractAmount);

  return Number.isFinite(amount) ? amount : 0;
}

function getEstimatedAmount(item: any) {
  const estimatedAmount = Number(
    item.preDealEstimatedAmount
  );

  if (
    Number.isFinite(estimatedAmount) &&
    estimatedAmount > 0
  ) {
    return estimatedAmount;
  }

  return getAmount(item);
}

function getCaseTitle(item: any) {
  return (
    item.title ||
    item.name ||
    item.companyName ||
    "未命名案件"
  );
}

function getContactName(item: any) {
  return (
    item.customer ||
    item.contactPerson ||
    "-"
  );
}

function getStageLabel(
  source: string,
  stage: string
) {
  const stageMap: Record<
    string,
    Record<string, string>
  > = {
    辦公室: {
      S1: "S1 待處理",
      S2: "S2 需求訪談",
      S3: "S3 口頭報價",
      S4: "S4 現場場勘",
      S5: "S5 需求確認（議價）",
      S6: "S6 擬定合約",
      S7: "S7 成交",
      S8: "S8 暫停",
    },

    質晑所課程: {
      S1: "S1 需求確認",
      S2: "S2 提供方案與報價",
      S3: "S3 內容討論與議價",
      S4: "S4 內容／報價更新待確認",
      S5: "S5 待回簽／付訂",
      S6: "S6 完成付訂",
      S7: "S7 執行",
      S8: "S8 暫停",
      S9: "S9 結案",
    },

    活動管理: {
      S1: "S1 初步諮詢",
      S2: "S2 對齊需求",
      S3: "S3 初步報價",
      S4: "S4 設備測試／參觀",
      S5: "S5 正式報價",
      S6: "S6 議價協商",
      S7: "S7 簽約／訂金確認",
      S8: "S8 成交",
      S9: "S9 活動前提醒",
      S10: "S10 活動前中後",
      S11: "S11 暫停",
    },
  };

  return (
    stageMap[source]?.[stage] ||
    stage ||
    "-"
  );
}

function SourceBadge({
  source,
}: {
  source: string;
}) {
  const styleMap: Record<string, string> = {
    辦公室:
      "border-blue-200 bg-blue-50 text-blue-700",

    質晑所課程:
      "border-emerald-200 bg-emerald-50 text-emerald-700",

    活動管理:
      "border-purple-200 bg-purple-50 text-purple-700",
  };

  return (
    <span
      className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${
        styleMap[source] ||
        "border-slate-200 bg-slate-50 text-slate-600"
      }`}
    >
      {source}
    </span>
  );
}

export default function WeeklyReportPage() {
  const [cases, setCases] = useState<any[]>([]);
  const [members, setMembers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let casesLoaded = false;
    let membersLoaded = false;

    const checkLoading = () => {
      if (casesLoaded && membersLoaded) {
        setLoading(false);
      }
    };

    const unsubscribeCases = onSnapshot(
      collection(db, "cases"),

      (snapshot) => {
        const data = snapshot.docs.map(
          (item) => ({
            id: item.id,
            ...item.data(),
          })
        );

        setCases(data);
        casesLoaded = true;
        checkLoading();
      },

      (error) => {
        console.error(
          "讀取 cases 失敗：",
          error
        );

        casesLoaded = true;
        checkLoading();
      }
    );

    const unsubscribeMembers = onSnapshot(
      collection(db, "members"),

      (snapshot) => {
        const data = snapshot.docs.map(
          (item) => ({
            id: item.id,
            ...item.data(),
          })
        );

        setMembers(data);
        membersLoaded = true;
        checkLoading();
      },

      (error) => {
        console.error(
          "讀取 members 失敗：",
          error
        );

        membersLoaded = true;
        checkLoading();
      }
    );

    return () => {
      unsubscribeCases();
      unsubscribeMembers();
    };
  }, []);

  const today = new Date();

  const startOfWeek =
    getStartOfWeek(today);

  const endOfWeek =
    getEndOfWeek(today);

  const reportEndDate =
    new Date(endOfWeek);

  reportEndDate.setDate(
    reportEndDate.getDate() - 1
  );

  const reportData = useMemo(() => {
    const registrations = members.filter(
      (item) =>
        item.productLines?.includes(
          "質晑所課程"
        )
    );

    const events = members.filter(
      (item) =>
        item.productLines?.includes(
          "活動管理"
        )
    );

    // ----------------------------
    // 本週新增案件
    // ----------------------------

    const weeklyCases = cases
      .filter((item) =>
        isDateInRange(
          item.createdAt,
          startOfWeek,
          endOfWeek
        )
      )
      .map((item) => ({
        ...item,
        source: "辦公室",
      }));

    const weeklyRegistrations =
      registrations
        .filter((item) =>
          isDateInRange(
            item.createdAt,
            startOfWeek,
            endOfWeek
          )
        )
        .map((item) => ({
          ...item,
          source: "質晑所課程",
        }));

    const weeklyEvents = events
      .filter((item) =>
        isDateInRange(
          item.createdAt,
          startOfWeek,
          endOfWeek
        )
      )
      .map((item) => ({
        ...item,
        source: "活動管理",
      }));

    // ----------------------------
    // 本週成交案件
    // ----------------------------

    const weeklyClosedCases = cases
      .filter((item) => {
        if (item.stage !== "S7") {
          return false;
        }

        const closeDate =
          item.stageHistory?.S7 ||
          item.stageEndedAt;

        return isDateInRange(
          closeDate,
          startOfWeek,
          endOfWeek
        );
      })
      .map((item) => ({
        ...item,
        source: "辦公室",
        closeDate:
          item.stageHistory?.S7 ||
          item.stageEndedAt,
      }));

    const weeklyClosedRegistrations =
      registrations
        .filter((item) => {
          if (item.stage !== "S9") {
            return false;
          }

          const closeDate =
            item.stageHistory?.S9 ||
            item.stageEndedAt;

          return isDateInRange(
            closeDate,
            startOfWeek,
            endOfWeek
          );
        })
        .map((item) => ({
          ...item,
          source: "質晑所課程",
          closeDate:
            item.stageHistory?.S9 ||
            item.stageEndedAt,
        }));

    const weeklyClosedEvents = events
      .filter((item) => {
        const successStages = [
          "S8",
          "S9",
          "S10",
        ];

        if (
          !successStages.includes(item.stage)
        ) {
          return false;
        }

        const closeDate =
          item.stageHistory?.S8 ||
          item.stageEndedAt;

        return isDateInRange(
          closeDate,
          startOfWeek,
          endOfWeek
        );
      })
      .map((item) => ({
        ...item,
        source: "活動管理",
        closeDate:
          item.stageHistory?.S8 ||
          item.stageEndedAt,
      }));

    const officeRevenue =
      weeklyClosedCases.reduce(
        (total, item) =>
          total + getAmount(item),
        0
      );

    const registrationRevenue =
      weeklyClosedRegistrations.reduce(
        (total, item) =>
          total + getAmount(item),
        0
      );

    const eventRevenue =
      weeklyClosedEvents.reduce(
        (total, item) =>
          total + getAmount(item),
        0
      );

    const weeklyNewDetails = [
      ...weeklyCases,
      ...weeklyRegistrations,
      ...weeklyEvents,
    ].sort((a, b) => {
      const dateA =
        toJsDate(
          a.createdAt
        )?.getTime() || 0;

      const dateB =
        toJsDate(
          b.createdAt
        )?.getTime() || 0;

      return dateB - dateA;
    });

    const weeklyClosedDetails = [
      ...weeklyClosedCases,
      ...weeklyClosedRegistrations,
      ...weeklyClosedEvents,
    ].sort((a, b) => {
      const dateA =
        toJsDate(
          a.closeDate
        )?.getTime() || 0;

      const dateB =
        toJsDate(
          b.closeDate
        )?.getTime() || 0;

      return dateB - dateA;
    });

    return {
      weeklyCases,
      weeklyRegistrations,
      weeklyEvents,

      weeklyTotal:
        weeklyCases.length +
        weeklyRegistrations.length +
        weeklyEvents.length,

      weeklyClosedCases,
      weeklyClosedRegistrations,
      weeklyClosedEvents,

      officeRevenue,
      registrationRevenue,
      eventRevenue,

      totalRevenue:
        officeRevenue +
        registrationRevenue +
        eventRevenue,

      totalClosedCount:
        weeklyClosedCases.length +
        weeklyClosedRegistrations.length +
        weeklyClosedEvents.length,

      weeklyNewDetails,
      weeklyClosedDetails,
    };
  }, [
    cases,
    members,
    startOfWeek.getTime(),
    endOfWeek.getTime(),
  ]);

  return (
    <main className="min-h-screen bg-slate-100 p-6 md:p-12">
      <section className="mx-auto max-w-7xl rounded-3xl bg-white p-8 shadow-sm">
        <header className="border-b border-slate-200 pb-6">
          <p className="text-sm font-medium text-blue-600">
            Jade Internal Control System
          </p>

          <h1 className="mt-2 text-3xl font-semibold text-slate-900">
            每週營運報表
          </h1>

          <p className="mt-2 text-sm text-slate-500">
            報表產生日期：
            {formatDate(today)}
          </p>

          <p className="mt-1 text-sm text-slate-500">
            報表區間：
            {formatDate(startOfWeek)}
            {" ～ "}
            {formatDate(reportEndDate)}
          </p>
        </header>

        {loading ? (
          <div className="mt-8 rounded-2xl border border-slate-200 p-10 text-center">
            <p className="font-medium text-slate-700">
              資料讀取中...
            </p>
          </div>
        ) : (
          <>
            {/* 第一區：本週新增案件 */}
            <section className="mt-8">
              <div className="mb-4">
                <h2 className="text-lg font-semibold text-slate-900">
                  本週新增案件
                </h2>

                <p className="mt-1 text-sm text-slate-500">
                  依案件建立日期統計
                </p>
              </div>

              <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-2xl border border-slate-200 p-6">
                  <p className="text-sm font-medium text-slate-500">
                    本週辦公室案件
                  </p>

                  <p className="mt-3 text-3xl font-normal text-slate-900">
                    {
                      reportData
                        .weeklyCases
                        .length
                    }
                  </p>

                  <p className="mt-1 text-xs text-slate-400">
                    本週新建立的辦公室案件
                  </p>
                </div>

                <div className="rounded-2xl border border-emerald-200 bg-emerald-50/40 p-6">
                  <p className="text-sm font-medium text-emerald-700">
                    本週質晑所課程
                  </p>

                  <p className="mt-3 text-3xl font-normal text-emerald-700">
                    {
                      reportData
                        .weeklyRegistrations
                        .length
                    }
                  </p>

                  <p className="mt-1 text-xs text-emerald-500">
                    本週新建立的課程案件
                  </p>
                </div>

                <div className="rounded-2xl border border-purple-200 bg-purple-50/40 p-6">
                  <p className="text-sm font-medium text-purple-700">
                    本週活動案件
                  </p>

                  <p className="mt-3 text-3xl font-normal text-purple-700">
                    {
                      reportData
                        .weeklyEvents
                        .length
                    }
                  </p>

                  <p className="mt-1 text-xs text-purple-500">
                    本週新建立的活動案件
                  </p>
                </div>

                <div className="rounded-2xl border border-blue-200 bg-blue-50 p-6">
                  <p className="text-sm font-medium text-blue-600">
                    本週全部新增案件
                  </p>

                  <p className="mt-3 text-3xl font-normal text-blue-700">
                    {
                      reportData
                        .weeklyTotal
                    }
                  </p>

                  <p className="mt-1 text-xs text-blue-400">
                    三條產品線合計
                  </p>
                </div>
              </div>
            </section>

            {/* 第二區：本週新增案件明細 */}
            <section className="mt-10 border-t border-slate-200 pt-8">
              <div className="mb-4">
                <h2 className="text-lg font-semibold text-slate-900">
                  本週新增案件明細
                </h2>

                <p className="mt-1 text-sm text-slate-500">
                  顯示本週建立的所有案件
                </p>
              </div>

              <div className="overflow-hidden rounded-2xl border border-slate-200">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[900px] text-left">
                    <thead className="bg-slate-50">
                      <tr className="border-b border-slate-200">
                        <th className="px-5 py-4 text-xs font-medium text-slate-500">
                          產品線
                        </th>

                        <th className="px-5 py-4 text-xs font-medium text-slate-500">
                          案件名稱
                        </th>

                        <th className="px-5 py-4 text-xs font-medium text-slate-500">
                          主要窗口
                        </th>

                        <th className="px-5 py-4 text-xs font-medium text-slate-500">
                          建立日期
                        </th>

                        <th className="px-5 py-4 text-xs font-medium text-slate-500">
                          目前階段
                        </th>

                        <th className="px-5 py-4 text-right text-xs font-medium text-slate-500">
                          預估／合約金額
                        </th>
                      </tr>
                    </thead>

                    <tbody className="divide-y divide-slate-100">
                      {reportData.weeklyNewDetails.map(
                        (item: any) => (
                          <tr
                            key={`${item.source}-${item.id}`}
                            className="hover:bg-slate-50/60"
                          >
                            <td className="px-5 py-4">
                              <SourceBadge
                                source={
                                  item.source
                                }
                              />
                            </td>

                            <td className="px-5 py-4 text-sm font-medium text-slate-800">
                              {getCaseTitle(
                                item
                              )}
                            </td>

                            <td className="px-5 py-4 text-sm text-slate-600">
                              {getContactName(
                                item
                              )}
                            </td>

                            <td className="px-5 py-4 text-sm text-slate-600">
                              {formatDateValue(
                                item.createdAt
                              )}
                            </td>

                            <td className="px-5 py-4 text-sm text-slate-600">
                              {getStageLabel(
                                item.source,
                                item.stage
                              )}
                            </td>

                            <td className="px-5 py-4 text-right text-sm font-normal text-slate-800">
                              {formatCurrency(
                                getEstimatedAmount(
                                  item
                                )
                              )}
                            </td>
                          </tr>
                        )
                      )}

                      {reportData
                        .weeklyNewDetails
                        .length === 0 && (
                        <tr>
                          <td
                            colSpan={6}
                            className="px-5 py-10 text-center text-sm text-slate-400"
                          >
                            本週沒有新增案件
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </section>

            {/* 第三區：本週成交業績 */}
            <section className="mt-10 border-t border-slate-200 pt-8">
              <div className="mb-4">
                <h2 className="text-lg font-semibold text-slate-900">
                  本週成交業績
                </h2>

                <p className="mt-1 text-sm text-slate-500">
                  依案件進入成交階段的日期統計
                </p>
              </div>

              <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-2xl border border-slate-200 p-6">
                  <p className="text-sm font-medium text-slate-500">
                    辦公室成交業績
                  </p>

                  <p className="mt-3 text-2xl font-normal text-slate-900">
                    {formatCurrency(
                      reportData
                        .officeRevenue
                    )}
                  </p>

                  <p className="mt-2 text-xs text-slate-400">
                    本週成交{" "}
                    {
                      reportData
                        .weeklyClosedCases
                        .length
                    }{" "}
                    件
                  </p>
                </div>

                <div className="rounded-2xl border border-emerald-200 bg-emerald-50/40 p-6">
                  <p className="text-sm font-medium text-emerald-700">
                    質晑所課程業績
                  </p>

                  <p className="mt-3 text-2xl font-normal text-emerald-700">
                    {formatCurrency(
                      reportData
                        .registrationRevenue
                    )}
                  </p>

                  <p className="mt-2 text-xs text-emerald-500">
                    本週結案{" "}
                    {
                      reportData
                        .weeklyClosedRegistrations
                        .length
                    }{" "}
                    件
                  </p>
                </div>

                <div className="rounded-2xl border border-purple-200 bg-purple-50/40 p-6">
                  <p className="text-sm font-medium text-purple-700">
                    活動管理業績
                  </p>

                  <p className="mt-3 text-2xl font-normal text-purple-700">
                    {formatCurrency(
                      reportData
                        .eventRevenue
                    )}
                  </p>

                  <p className="mt-2 text-xs text-purple-500">
                    本週成交{" "}
                    {
                      reportData
                        .weeklyClosedEvents
                        .length
                    }{" "}
                    件
                  </p>
                </div>

                <div className="rounded-2xl border border-blue-200 bg-blue-50 p-6">
                  <p className="text-sm font-medium text-blue-600">
                    本週成交業績合計
                  </p>

                  <p className="mt-3 text-2xl font-normal text-blue-700">
                    {formatCurrency(
                      reportData
                        .totalRevenue
                    )}
                  </p>

                  <p className="mt-2 text-xs text-blue-500">
                    共成交／結案{" "}
                    {
                      reportData
                        .totalClosedCount
                    }{" "}
                    件
                  </p>
                </div>
              </div>
            </section>

            {/* 第四區：本週成交案件明細 */}
            <section className="mt-10 border-t border-slate-200 pt-8">
              <div className="mb-4">
                <h2 className="text-lg font-semibold text-slate-900">
                  本週成交案件明細
                </h2>

                <p className="mt-1 text-sm text-slate-500">
                  顯示本週進入成交或結案階段的案件
                </p>
              </div>

              <div className="overflow-hidden rounded-2xl border border-slate-200">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[850px] text-left">
                    <thead className="bg-slate-50">
                      <tr className="border-b border-slate-200">
                        <th className="px-5 py-4 text-xs font-medium text-slate-500">
                          產品線
                        </th>

                        <th className="px-5 py-4 text-xs font-medium text-slate-500">
                          案件名稱
                        </th>

                        <th className="px-5 py-4 text-xs font-medium text-slate-500">
                          主要窗口
                        </th>

                        <th className="px-5 py-4 text-xs font-medium text-slate-500">
                          成交／結案日期
                        </th>

                        <th className="px-5 py-4 text-xs font-medium text-slate-500">
                          目前階段
                        </th>

                        <th className="px-5 py-4 text-right text-xs font-medium text-slate-500">
                          成交金額
                        </th>
                      </tr>
                    </thead>

                    <tbody className="divide-y divide-slate-100">
                      {reportData.weeklyClosedDetails.map(
                        (item: any) => (
                          <tr
                            key={`${item.source}-${item.id}`}
                            className="hover:bg-slate-50/60"
                          >
                            <td className="px-5 py-4">
                              <SourceBadge
                                source={
                                  item.source
                                }
                              />
                            </td>

                            <td className="px-5 py-4 text-sm font-medium text-slate-800">
                              {getCaseTitle(
                                item
                              )}
                            </td>

                            <td className="px-5 py-4 text-sm text-slate-600">
                              {getContactName(
                                item
                              )}
                            </td>

                            <td className="px-5 py-4 text-sm text-slate-600">
                              {formatDateValue(
                                item.closeDate
                              )}
                            </td>

                            <td className="px-5 py-4 text-sm text-slate-600">
                              {getStageLabel(
                                item.source,
                                item.stage
                              )}
                            </td>

                            <td className="px-5 py-4 text-right text-sm font-normal text-slate-800">
                              {formatCurrency(
                                getAmount(item)
                              )}
                            </td>
                          </tr>
                        )
                      )}

                      {reportData
                        .weeklyClosedDetails
                        .length === 0 && (
                        <tr>
                          <td
                            colSpan={6}
                            className="px-5 py-10 text-center text-sm text-slate-400"
                          >
                            本週沒有成交或結案案件
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </section>
          </>
        )}
      </section>
    </main>
  );
}