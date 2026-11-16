import { Printer, X } from 'lucide-react';
import type {
  Application,
  ApplicationQuestion,
  Evaluation,
  Report,
  Round,
  Settings,
  Student,
  University,
} from '../types';
import { formatKoreanDateTime } from '../utils/format';

interface ReportPrintViewProps {
  students: Student[];
  applications: Application[];
  universities: University[];
  rounds: Round[];
  questions: ApplicationQuestion[];
  evaluations: Evaluation[];
  reports: Report[];
  settings: Settings;
  onClose?: () => void;
}

export function ReportPrintView({
  students,
  applications,
  universities,
  rounds,
  questions,
  evaluations,
  reports,
  settings,
  onClose,
}: ReportPrintViewProps) {
  const univMap = new Map(universities.map((u) => [u.id, u]));
  const roundMap = new Map(rounds.map((r) => [r.id, r]));
  const reportMap = new Map(reports.map((r) => [r.studentId, r]));

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 overflow-y-auto print:static print:bg-white print:overflow-visible">
      <div className="no-print sticky top-0 z-10 bg-white border-b border-slate-200 px-6 py-3 flex flex-wrap items-center justify-between gap-4 shadow-sm">
        <div>
          <p className="text-base font-bold text-slate-900">
            학생별 결과지 인쇄 미리보기 ({students.length}명)
          </p>
          <p className="text-sm text-slate-600">
            인쇄 대화상자에서 대상 프린터를 <span className="font-semibold text-[#1E3A5F]">PDF로 저장</span>으로
            선택하면 PDF 파일로 내려받을 수 있습니다.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-white bg-[#1E3A5F] hover:bg-[#162d4a] rounded-lg"
          >
            <Printer className="w-4 h-4" />
            <span>인쇄 / PDF 저장</span>
          </button>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="inline-flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg"
            >
              <X className="w-4 h-4" />
              <span>닫기</span>
            </button>
          )}
        </div>
      </div>

      <div className="max-w-[210mm] mx-auto my-6 space-y-8 print:my-0 print:space-y-0">
        {students.map((student) => {
          const stuApps = applications
            .filter((a) => a.studentId === student.id)
            .sort((a, b) => a.sequenceNo - b.sequenceNo);
          const report = reportMap.get(student.id);
          const firstRound = stuApps[0] ? roundMap.get(stuApps[0].roundId) : undefined;

          return (
            <article
              key={student.id}
              className="print-page bg-white rounded-xl border border-slate-200 shadow-sm p-8 space-y-6"
            >
              {/* 머리말 */}
              <header className="border-b-2 border-[#1E3A5F] pb-4 flex flex-wrap items-end justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold text-[#0F766E]">
                    {settings.schoolName} · {settings.eventName}
                  </p>
                  <h1 className="text-2xl font-bold text-slate-900 mt-1">
                    대입 모의면접 종합 결과지
                  </h1>
                </div>
                <div className="text-right text-sm text-slate-600 tabular-nums">
                  {firstRound && (
                    <p>
                      {firstRound.name} · {formatKoreanDateTime(firstRound.date)}
                    </p>
                  )}
                  <p>확정 상태: {report?.status === 'confirmed' ? '확정 완료' : '미확정(초안)'}</p>
                </div>
              </header>

              {/* 학생 기본 정보 */}
              <section className="grid grid-cols-2 sm:grid-cols-4 gap-4 bg-slate-50 border border-slate-200 rounded-lg p-4 text-sm">
                <div>
                  <span className="text-slate-500 block text-xs">학번</span>
                  <span className="font-bold text-slate-900 font-mono tabular-nums">
                    {student.studentNo}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block text-xs">성명</span>
                  <span className="font-bold text-slate-900">{student.name}</span>
                </div>
                <div>
                  <span className="text-slate-500 block text-xs">학반</span>
                  <span className="font-semibold text-slate-900">{student.classLabel}</span>
                </div>
                <div>
                  <span className="text-slate-500 block text-xs">희망 전공</span>
                  <span className="font-semibold text-slate-900">
                    {student.desiredMajor || '-'}
                  </span>
                </div>
              </section>

              {/* 대학별 면접 섹션 */}
              {stuApps.length === 0 ? (
                <p className="text-sm text-slate-500 py-6 text-center border border-dashed border-slate-200 rounded-lg">
                  응시한 모의면접 기록이 없습니다.
                </p>
              ) : (
                <div className="space-y-6">
                  {stuApps.map((app) => {
                    const univ = univMap.get(app.universityId);
                    const appEvals = evaluations.filter(
                      (e) => e.applicationId === app.id && e.status === 'submitted'
                    );
                    const appQuestions = questions
                      .filter((q) => q.applicationId === app.id)
                      .sort((a, b) => a.seq - b.seq);

                    const avgConverted =
                      appEvals.length > 0
                        ? (
                            appEvals.reduce((sum, e) => sum + e.convertedScore, 0) / appEvals.length
                          ).toFixed(1)
                        : '-';

                    // 자주 선택된 퀵 태그 집계
                    const tagCounts = new Map<string, number>();
                    for (const ev of appEvals) {
                      for (const t of ev.quickTags) {
                        tagCounts.set(t, (tagCounts.get(t) ?? 0) + 1);
                      }
                    }
                    const topTags = Array.from(tagCounts.entries())
                      .sort((a, b) => b[1] - a[1])
                      .slice(0, 6);

                    // 질문 체크리스트 요약
                    const goodQuestions: string[] = [];
                    const workQuestions: string[] = [];
                    for (const q of appQuestions) {
                      const checks = appEvals
                        .map((ev) => ev.questionChecks[q.id])
                        .filter(Boolean);
                      if (checks.includes('needs_work')) {
                        workQuestions.push(q.questionText);
                      } else if (checks.includes('good')) {
                        goodQuestions.push(q.questionText);
                      }
                    }

                    return (
                      <section
                        key={app.id}
                        className="print-avoid-break border border-slate-200 rounded-lg p-5 space-y-4"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-3">
                          <div>
                            <div className="flex items-center gap-2">
                              <span
                                className="inline-block w-2.5 h-2.5 rounded-full"
                                style={{ backgroundColor: univ?.color ?? '#1E3A5F' }}
                              />
                              <h2 className="text-lg font-bold text-slate-900">
                                {univ?.name ?? '대학'} · {univ?.admissionType ?? ''}
                              </h2>
                            </div>
                            <p className="text-sm text-slate-600 mt-0.5">
                              모집단위: {app.major || student.desiredMajor || '-'} · 참여 면접관{' '}
                              {appEvals.length}명
                            </p>
                          </div>
                          <div className="text-right">
                            <span className="text-xs text-slate-500 block">평균 환산점수</span>
                            <span className="text-2xl font-bold text-[#1E3A5F] font-mono tabular-nums">
                              {avgConverted}
                              <span className="text-sm font-normal text-slate-500"> / 100</span>
                            </span>
                          </div>
                        </div>

                        {/* 항목별 평균 SVG 수평 막대 차트 */}
                        {univ && appEvals.length > 0 && (
                          <div className="space-y-2">
                            <h3 className="text-xs font-semibold text-slate-600">
                              평가 항목별 평균 (5점 만점)
                            </h3>
                            <div className="space-y-2">
                              {univ.rubric.map((item) => {
                                const vals = appEvals
                                  .map((e) => e.scores[item.key])
                                  .filter((v): v is number => typeof v === 'number');
                                const avg =
                                  vals.length > 0
                                    ? vals.reduce((a, b) => a + b, 0) / vals.length
                                    : 0;
                                const pct = Math.min(100, Math.max(0, (avg / 5) * 100));
                                return (
                                  <div
                                    key={item.key}
                                    className="grid grid-cols-12 items-center gap-2 text-xs"
                                  >
                                    <span className="col-span-4 font-medium text-slate-800 truncate">
                                      {item.label} ({item.weight}%)
                                    </span>
                                    <div className="col-span-6">
                                      <svg
                                        width="100%"
                                        height="12"
                                        viewBox="0 0 200 12"
                                        preserveAspectRatio="none"
                                        aria-hidden="true"
                                      >
                                        <rect
                                          x="0"
                                          y="2"
                                          width="200"
                                          height="8"
                                          rx="4"
                                          fill="#E2E8F0"
                                        />
                                        <rect
                                          x="0"
                                          y="2"
                                          width={(pct / 100) * 200}
                                          height="8"
                                          rx="4"
                                          fill={univ.color || '#1E3A5F'}
                                        />
                                      </svg>
                                    </div>
                                    <span className="col-span-2 text-right font-mono font-semibold text-slate-900 tabular-nums">
                                      {avg.toFixed(1)}
                                    </span>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}

                        {/* 자주 선택된 퀵 태그 */}
                        {topTags.length > 0 && (
                          <div className="text-xs text-slate-700">
                            <span className="font-semibold text-slate-800 mr-2">주요 관찰 특징:</span>
                            <span>
                              {topTags.map(([tag, cnt]) => `${tag}(${cnt})`).join(' · ')}
                            </span>
                          </div>
                        )}

                        {/* 질문 체크리스트 요약 */}
                        {(goodQuestions.length > 0 || workQuestions.length > 0) && (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs bg-slate-50 border border-slate-200 rounded-lg p-3">
                            <div>
                              <p className="font-semibold text-emerald-800 mb-1">잘 답한 질문</p>
                              {goodQuestions.length === 0 ? (
                                <p className="text-slate-500">기록 없음</p>
                              ) : (
                                <ul className="list-disc pl-4 space-y-0.5 text-slate-700">
                                  {goodQuestions.map((q, i) => (
                                    <li key={i}>{q}</li>
                                  ))}
                                </ul>
                              )}
                            </div>
                            <div>
                              <p className="font-semibold text-amber-800 mb-1">보완이 필요한 질문</p>
                              {workQuestions.length === 0 ? (
                                <p className="text-slate-500">기록 없음</p>
                              ) : (
                                <ul className="list-disc pl-4 space-y-0.5 text-slate-700">
                                  {workQuestions.map((q, i) => (
                                    <li key={i}>{q}</li>
                                  ))}
                                </ul>
                              )}
                            </div>
                          </div>
                        )}

                        {/* 면접관 조언 (면접관 A/B 익명 표기, 실명·운영자 메모 절대 비공개) */}
                        <div className="space-y-2.5">
                          <h3 className="text-xs font-semibold text-slate-600">
                            면접위원 종합 조언 및 강점·보완점
                          </h3>
                          {appEvals.length === 0 ? (
                            <p className="text-xs text-slate-500">제출된 평가가 없습니다.</p>
                          ) : (
                            <div className="space-y-2">
                              {appEvals.map((ev, idx) => {
                                const anonLabel = `면접관 ${String.fromCharCode(65 + (idx % 26))}`;
                                return (
                                  <div
                                    key={ev.id}
                                    className="text-xs bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-1"
                                  >
                                    <div className="flex items-center justify-between font-semibold text-slate-800">
                                      <span>{anonLabel}</span>
                                      <span className="text-slate-600">
                                        판정: {ev.overall} · {ev.convertedScore}점
                                      </span>
                                    </div>
                                    {ev.strengths && (
                                      <p className="text-slate-700">
                                        <span className="font-semibold text-slate-900">강점:</span>{' '}
                                        {ev.strengths}
                                      </p>
                                    )}
                                    {ev.improvements && (
                                      <p className="text-slate-700">
                                        <span className="font-semibold text-slate-900">보완점:</span>{' '}
                                        {ev.improvements}
                                      </p>
                                    )}
                                    {ev.adviceToStudent && (
                                      <p className="text-slate-800">
                                        <span className="font-semibold text-[#0F766E]">조언:</span>{' '}
                                        {ev.adviceToStudent}
                                      </p>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      </section>
                    );
                  })}
                </div>
              )}

              {/* 마무리: 운영자 종합 코멘트 + 다음 준비 체크리스트 3줄 */}
              <section className="print-avoid-break space-y-4 pt-2">
                <div className="border border-slate-200 rounded-lg p-4">
                  <h3 className="text-sm font-bold text-[#1E3A5F] mb-1.5">종합 코멘트</h3>
                  <p className="text-sm text-slate-800 whitespace-pre-wrap leading-relaxed">
                    {report?.adminComment || '면접 결과를 바탕으로 보완할 질문을 중심으로 답변 연습을 이어가세요.'}
                  </p>
                </div>

                <div className="border border-slate-200 rounded-lg p-4 space-y-3">
                  <h3 className="text-sm font-bold text-slate-900">다음 준비 체크리스트 (학생 작성)</h3>
                  <div className="space-y-4 pt-1">
                    {[1, 2, 3].map((n) => (
                      <div key={n} className="flex items-center gap-3">
                        <span className="w-4 h-4 border border-slate-400 rounded-sm inline-block shrink-0" />
                        <div className="flex-1 border-b border-slate-300 h-5" />
                      </div>
                    ))}
                  </div>
                </div>
              </section>

              {/* 바닥글 */}
              <footer className="border-t border-slate-200 pt-3 text-center text-xs text-slate-500">
                본 결과지는 교내 모의면접 결과로 실제 대학 평가와 다를 수 있습니다. 외부 유출을 금합니다.
              </footer>
            </article>
          );
        })}
      </div>
    </div>
  );
}
