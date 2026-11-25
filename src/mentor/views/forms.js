import { esc } from '../../shared/esc.js';
import { today, runSubmit, reportError } from '../../shared/format.js';
import { closedRequired, stageCount } from '../../shared/program.js';
import { state, navigate, myMentees, isAdmin, isMyMentee } from '../state.js';
import { dom, setHeader, menteeOptionsHtml, scoreRow, MENTOR_ONLY_BADGE } from './common.js';
import {
  loadFromSupabase, saveMentee, saveMenteeNotes, saveCheckIn, saveFeedback, saveKickoff, saveEscalation, saveGraduation,
  updateMyProfile, linkHelpRequestToEscalation,
} from '../data.js';

// Below md: 44px tall controls and 16px text (no iOS focus zoom); md+ unchanged.
const INPUT = 'w-full border border-navy-200 rounded-lg px-3 py-2 max-md:min-h-[44px] max-md:text-base';
// Half-width inputs in the modal grids (stacked full-width on phones).
const HALF_INPUT = 'border border-navy-200 rounded-lg px-3 py-2 max-md:w-full max-md:min-h-[44px] max-md:text-base';
// Checkbox rows: the whole label is a comfortable tap target on phones.
const CHECK_LABEL = 'flex items-center gap-2 max-md:min-h-[44px] max-md:py-1 cursor-pointer';
const CHECK_BOX = 'max-md:h-5 max-md:w-5 shrink-0';
// Form submit/cancel row. Phones: sticky in the thumb zone just above the tab
// bar (.form-actions in styles.css), primary button fills the row. md+: the
// original in-flow row.
const ACTIONS_ROW = 'form-actions flex gap-3';
const SUBMIT_BTN = 'btn-primary px-8 py-3 rounded-xl min-h-[44px] max-md:flex-1 max-md:px-4';
// Modal submit/cancel row. Phones: pinned to the bottom of the sheet with
// Cancel left / primary right (.sheet-actions). md+: the original row.
const MODAL_ACTIONS = 'sheet-actions flex gap-2 pt-2 max-md:flex-row-reverse';
const MODAL_BTN = 'max-md:min-h-[44px] max-md:flex-1';

function shareToggle(name, label, hint) {
  return `
    <label class="flex items-start gap-3 card p-4 border border-emerald-200 cursor-pointer">
      <input type="checkbox" name="${name}" checked class="mt-1 rounded ${CHECK_BOX}">
      <span><span class="font-medium">${esc(label)}</span><span class="block text-xs text-navy-700/60">${esc(hint)}</span></span>
    </label>`;
}

function cancelButton() {
  return `<button type="button" data-action="nav" data-view="dashboard" class="px-6 py-3 rounded-xl border min-h-[44px] max-md:px-5 max-md:bg-white">Cancel</button>`;
}

function noMenteesNotice() {
  return myMentees().length ? '' : `<div class="card p-4 mb-6 text-sm text-amber-800 bg-amber-50">You don’t mentor anyone yet. Add a mentee first.</div>`;
}

// ---------------------------------------------------------------------------
export function renderCheckInForm() {
  setHeader('New Check-In', 'Record a mentor session');
  const menteeOptions = menteeOptionsHtml(state.prefillMenteeId);

  dom.app.innerHTML = `
    ${noMenteesNotice()}
    <form id="checkin-form" class="max-w-3xl space-y-8">
      <div class="card p-6 space-y-4">
        <h3 class="font-medium">Session Information</h3>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label class="block text-sm mb-1">Mentee</label>
            <select name="menteeId" required class="${INPUT}" data-input-action="checkin-mentee-changed">${menteeOptions}</select>
          </div>
          <div>
            <label class="block text-sm mb-1">Date</label>
            <input type="date" name="date" value="${today()}" required class="${INPUT}">
          </div>
          <div>
            <label class="block text-sm mb-1">Check-In #</label>
            <input type="number" name="checkInNumber" min="1" value="1" class="${INPUT}">
          </div>
          <div>
            <label class="block text-sm mb-1">Meeting Format</label>
            <input type="text" name="meetingFormat" placeholder="Zoom, phone, in-person..." class="${INPUT}">
          </div>
        </div>
        <div id="self-checkin-hint"></div>
      </div>

      <div class="card p-6 space-y-5">
        <h3 class="font-medium">Assess — Where is the student right now?</h3>
        ${scoreRow('Lead Generation Activity', 'leadGenerationActivity')}
        ${scoreRow('LightSpeed VT Progress', 'lightSpeedVtProgress')}
        ${scoreRow('Lofty CRM Usage', 'loftyCrmUsage')}
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label class="block text-sm mb-1">Transactions in Pipeline</label>
            <input type="number" name="transactionsInPipeline" min="0" class="${INPUT}">
          </div>
          <div>
            <label class="block text-sm mb-1">Total Closed (to date)</label>
            <input type="number" name="totalClosed" min="0" class="${INPUT}">
          </div>
        </div>
      </div>

      <div class="card p-6 space-y-4">
        <h3 class="font-medium">Direct & Verify</h3>
        <div>
          <label class="block text-sm mb-1">Specific Direction Given</label>
          <textarea name="specificDirectionGiven" rows="2" class="${INPUT}"></textarea>
        </div>
        <div>
          <label class="block text-sm mb-1">Prior Commitment Status</label>
          <select name="priorCommitmentStatus" class="${INPUT}">
            <option value="">—</option>
            <option value="yes">Yes — fully completed</option>
            <option value="partial">Partially completed</option>
            <option value="not">Not completed</option>
          </select>
        </div>
      </div>

      <div class="card p-6 space-y-4">
        <h3 class="font-medium">Strategize & Hold the Line</h3>
        <div>
          <label class="block text-sm mb-1">Topics Discussed</label>
          <textarea name="topicsDiscussed" rows="2" class="${INPUT}"></textarea>
        </div>
        <div>
          <label class="block text-sm mb-1">Key Coaching Points</label>
          <textarea name="keyCoachingPoints" rows="2" class="${INPUT}"></textarea>
        </div>
        <div>
          <label class="block text-sm mb-1">Student Commitment for Next Session</label>
          <textarea name="studentCommitment" rows="2" class="${INPUT}"></textarea>
        </div>
        <div>
          <label class="block text-sm mb-1">Due Before Next Check-In</label>
          <input type="date" name="commitmentDueDate" class="${INPUT}">
        </div>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label class="block text-sm mb-1">Next Check-In Date</label>
            <input type="date" name="nextCheckInDate" class="${INPUT}">
          </div>
          <div>
            <label class="block text-sm mb-1">Next Format / Link</label>
            <input type="text" name="nextCheckInFormat" class="${INPUT}">
          </div>
        </div>
      </div>

      <div class="card p-6 space-y-4 mentor-only">
        <div class="flex flex-wrap items-center justify-between gap-2"><h3 class="font-medium">Mentor-only notes</h3>${MENTOR_ONLY_BADGE}</div>
        <div>
          <label class="block text-sm mb-1">General Assessment Notes</label>
          <textarea name="generalAssessmentNotes" rows="3" class="${INPUT}"></textarea>
        </div>
        <div>
          <label class="block text-sm mb-1">Verification Notes</label>
          <textarea name="verificationNotes" rows="2" class="${INPUT}"></textarea>
        </div>
        <label class="${CHECK_LABEL}">
          <input type="checkbox" name="escalationFlag" class="rounded ${CHECK_BOX}">
          <span>Escalation required</span>
        </label>
        <div>
          <label class="block text-sm mb-1">Escalation Notes</label>
          <textarea name="escalationNotes" rows="2" class="${INPUT}"></textarea>
        </div>
      </div>

      ${shareToggle('sharedWithMentee', 'Share this check-in with the mentee',
        'They will see the scores, direction, commitment and next check-in in their portal. Mentor-only notes are never shared.')}

      <div class="${ACTIONS_ROW}">
        <button type="submit" class="${SUBMIT_BTN}">Save Check-In</button>
        ${cancelButton()}
      </div>
    </form>
  `;
  updateSelfCheckInHint();

  document.getElementById('checkin-form').onsubmit = async (e) => {
    e.preventDefault();
    const form = e.target;
    const data = Object.fromEntries(new FormData(form).entries());
    const mentee = state.mentees.find(x => x.id === data.menteeId);
    const checkIn = {
      menteeId: data.menteeId,
      checkInNumber: Number(data.checkInNumber) || 1,
      date: data.date,
      stageAtTime: mentee ? (Number(mentee.currentStage) || null) : null,
      meetingFormat: data.meetingFormat || null,
      leadGenerationActivity: data.leadGenerationActivity ? Number(data.leadGenerationActivity) : null,
      lightSpeedVtProgress: data.lightSpeedVtProgress ? Number(data.lightSpeedVtProgress) : null,
      loftyCrmUsage: data.loftyCrmUsage ? Number(data.loftyCrmUsage) : null,
      transactionsInPipeline: data.transactionsInPipeline ? Number(data.transactionsInPipeline) : null,
      totalClosed: data.totalClosed ? Number(data.totalClosed) : null,
      generalAssessmentNotes: data.generalAssessmentNotes || null,
      specificDirectionGiven: data.specificDirectionGiven || null,
      priorCommitmentStatus: data.priorCommitmentStatus || null,
      verificationNotes: data.verificationNotes || null,
      topicsDiscussed: data.topicsDiscussed || null,
      keyCoachingPoints: data.keyCoachingPoints || null,
      studentCommitment: data.studentCommitment || null,
      commitmentDueDate: data.commitmentDueDate || null,
      escalationFlag: !!data.escalationFlag,
      escalationNotes: data.escalationNotes || null,
      nextCheckInDate: data.nextCheckInDate || null,
      nextCheckInFormat: data.nextCheckInFormat || null,
      sharedWithMentee: !!data.sharedWithMentee,
    };
    await runSubmit(form, async () => {
      await saveCheckIn(checkIn);
      // The check-in is saved; a failed status update must not invite a duplicate resubmit.
      let statusErr = null;
      if (checkIn.escalationFlag && mentee && mentee.status !== 'escalated') {
        try {
          await saveMentee({ ...mentee, status: 'escalated' }, { previousStatus: mentee.status });
        } catch (err) {
          statusErr = err;
        }
      }
      await loadFromSupabase();
      navigate('mentee', { menteeId: checkIn.menteeId });
      if (statusErr) reportError(statusErr);
    });
  };
}

function latestSelfCheckIn(menteeId) {
  return state.selfCheckIns.filter(s => s.mentee_id === menteeId)
    .sort((a, b) => (b.week_of || '').localeCompare(a.week_of || ''))[0] || null;
}

export function updateSelfCheckInHint() {
  const form = document.getElementById('checkin-form');
  const box = document.getElementById('self-checkin-hint');
  if (!form || !box) return;
  const s = latestSelfCheckIn(form.menteeId.value);
  box.innerHTML = s ? `
    <div class="rounded-lg bg-navy-50 p-3 text-sm flex items-center justify-between gap-3 max-md:flex-col max-md:items-stretch">
      <span>Mentee self check-in for week of ${esc(s.week_of)}${s.reviewed_at ? ' (reviewed)' : ''}.</span>
      <button type="button" data-action="prefill-from-self" data-id="${esc(s.id)}" class="text-xs px-3 py-1.5 rounded-lg border border-navy-200 bg-white max-md:min-h-[44px] max-md:text-sm">Prefill from self check-in</button>
    </div>` : '';
}

export function prefillFromSelfCheckIn(id) {
  const s = state.selfCheckIns.find(x => x.id === id);
  const form = document.getElementById('checkin-form');
  if (!s || !form) return;
  const setRadio = (name, v) => {
    if (!v) return;
    const el = form.querySelector(`input[name="${name}"][value="${Number(v)}"]`);
    if (el) el.checked = true;
  };
  setRadio('leadGenerationActivity', s.lead_gen_self_score);
  setRadio('lightSpeedVtProgress', s.vt_self_score);
  setRadio('loftyCrmUsage', s.lofty_self_score);
  if (s.transactions_in_pipeline != null) form.transactionsInPipeline.value = s.transactions_in_pipeline;
  if (s.total_closed != null) form.totalClosed.value = s.total_closed;
  if (s.prior_commitment_status) form.priorCommitmentStatus.value = s.prior_commitment_status;
}

// ---------------------------------------------------------------------------
export function renderEscalationForm() {
  setHeader('Escalation Document', 'Submit to National Director');
  const fromHelp = state.escalationHelpId
    ? state.helpRequests.find(h => h.id === state.escalationHelpId) || null
    : null;
  const menteeOptions = menteeOptionsHtml(fromHelp ? fromHelp.mentee_id : state.prefillMenteeId);
  const helpType = fromHelp && fromHelp.category === 'compliance_legal' ? 'compliance_legal'
    : fromHelp && fromHelp.category === 'personal' ? 'mental_health' : null;
  const typeOpt = (value, label) => `<option value="${value}" ${helpType === value ? 'selected' : ''}>${label}</option>`;
  dom.app.innerHTML = `
    ${noMenteesNotice()}
    <form id="escalation-form" class="max-w-3xl space-y-6">
      ${fromHelp ? `<div class="card p-4 text-sm bg-amber-50">Converting a help request from the mentee. Once submitted, the help request is marked “escalated” and linked to this escalation.</div>` : ''}
      <div class="card p-6 space-y-4">
        <h3 class="font-medium">Parties Involved</h3>
        <div>
          <label class="block text-sm mb-1">Mentee</label>
          <select name="menteeId" required class="${INPUT}">${menteeOptions}</select>
        </div>
        <div>
          <label class="block text-sm mb-1">Date of Submission</label>
          <input type="date" name="dateOfSubmission" value="${today()}" required class="${INPUT}">
        </div>
        <div>
          <label class="block text-sm mb-1">Student Program Stage</label>
          <input type="text" name="studentProgramStage" class="${INPUT}">
        </div>
      </div>
      <div class="card p-6 space-y-4">
        <h3 class="font-medium">Escalation Type</h3>
        <select name="escalationType" required class="${INPUT}">
          ${typeOpt('disengaged', 'Disengaged Student')}
          ${typeOpt('compliance_legal', 'Compliance / Legal Question')}
          ${typeOpt('mental_health', 'Mental Health or Personal Crisis')}
          ${typeOpt('financial_crisis', 'Financial Crisis')}
          ${typeOpt('family_emergency', 'Family Emergency')}
          ${typeOpt('other', 'Other')}
        </select>
      </div>
      <div class="card p-6 space-y-4">
        <h3 class="font-medium">Situation Summary</h3>
        <textarea name="situationSummary" rows="4" required placeholder="What happened? When did it start? Check-ins affected?" class="${INPUT}">${fromHelp ? esc(`Mentee help request (${fromHelp.created_at ? fromHelp.created_at.slice(0, 10) : ''}):\n${fromHelp.message || ''}`) : ''}</textarea>
      </div>
      <div class="card p-6 space-y-4">
        <h3 class="font-medium">Actions Already Taken</h3>
        <textarea name="actionsAlreadyTaken" rows="3" placeholder="One action per line" class="${INPUT}"></textarea>
        <textarea name="additionalContext" rows="2" placeholder="Additional context" class="${INPUT}"></textarea>
      </div>
      <div class="card p-6 space-y-4">
        <h3 class="font-medium">Recommended Next Step</h3>
        <select name="recommendedNextStep" class="${INPUT}">
          <option value="guidance">Guidance on how to proceed</option>
          <option value="student_review">Student review / intervention</option>
          <option value="program_pause">Student placed on formal program pause</option>
          <option value="outside_support">Referred to outside professional support</option>
          <option value="compliance_review">Compliance / legal review</option>
          <option value="other">Other</option>
        </select>
      </div>
      <div class="text-xs text-navy-700/60">Escalations are never visible to the mentee.</div>
      <div class="${ACTIONS_ROW}">
        <button type="submit" class="${SUBMIT_BTN}">Submit Escalation</button>
        ${cancelButton()}
      </div>
    </form>
  `;
  document.getElementById('escalation-form').onsubmit = async (e) => {
    e.preventDefault();
    const form = e.target;
    const data = Object.fromEntries(new FormData(form).entries());
    const escalation = {
      menteeId: data.menteeId,
      dateOfSubmission: data.dateOfSubmission,
      studentProgramStage: data.studentProgramStage || null,
      escalationType: data.escalationType,
      situationSummary: data.situationSummary,
      actionsAlreadyTaken: data.actionsAlreadyTaken
        ? data.actionsAlreadyTaken.split('\n').map(s => s.trim()).filter(Boolean)
        : [],
      recommendedNextStep: data.recommendedNextStep,
      additionalContext: data.additionalContext || null,
    };
    const helpId = fromHelp && fromHelp.mentee_id === escalation.menteeId ? fromHelp.id : null;
    await runSubmit(form, async () => {
      const escalationId = await saveEscalation(escalation);
      // The escalation is saved; follow-up failures must not invite a duplicate resubmit.
      const followUps = [];
      if (helpId && escalationId) followUps.push(linkHelpRequestToEscalation(helpId, escalationId));
      const m = state.mentees.find(x => x.id === escalation.menteeId);
      if (m && m.status !== 'escalated') followUps.push(saveMentee({ ...m, status: 'escalated' }, { previousStatus: m.status }));
      const results = await Promise.allSettled(followUps);
      await loadFromSupabase();
      navigate('mentee', { menteeId: escalation.menteeId });
      results.filter(r => r.status === 'rejected').forEach(r => reportError(r.reason));
    });
  };
}

// ---------------------------------------------------------------------------
export function renderGraduationForm() {
  setHeader('Graduation Recommendation', 'Submit when the student is ready');
  const menteeOptions = menteeOptionsHtml(state.prefillMenteeId);
  const required = closedRequired();
  dom.app.innerHTML = `
    ${noMenteesNotice()}
    <form id="graduation-form" class="max-w-3xl space-y-6">
      <div class="card p-4 text-sm bg-gold-50">Submitting sends this recommendation to the program admin for approval. The mentee is marked graduated only after the admin approves it.</div>
      <div class="card p-6 space-y-4">
        <h3 class="font-medium">Student & Mentor Information</h3>
        <div>
          <label class="block text-sm mb-1">Mentee</label>
          <select name="menteeId" required class="${INPUT}">${menteeOptions}</select>
        </div>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label class="block text-sm mb-1">Date of Submission</label>
            <input type="date" name="dateOfSubmission" value="${today()}" required class="${INPUT}">
          </div>
          <div>
            <label class="block text-sm mb-1">Program Start Date</label>
            <input type="date" name="programStartDate" class="${INPUT}">
          </div>
        </div>
      </div>
      <div class="card p-6 space-y-3">
        <h3 class="font-medium">Graduation Requirements (all must be confirmed)</h3>
        <label class="${CHECK_LABEL}"><input type="checkbox" name="closedTransactionsConfirmed" class="${CHECK_BOX}"> ${esc(required)} Closed Residential Transactions</label>
        <label class="${CHECK_LABEL}"><input type="checkbox" name="lightSpeedVtCompleted" class="${CHECK_BOX}"> All LightSpeed VT Modules Completed</label>
        <label class="${CHECK_LABEL}"><input type="checkbox" name="nexaLendingConnected" class="${CHECK_BOX}"> Connected with Nexa Lending Partner</label>
        <label class="${CHECK_LABEL}"><input type="checkbox" name="loftyCrmProficient" class="${CHECK_BOX}"> Proficient in Lofty CRM</label>
        <label class="${CHECK_LABEL}"><input type="checkbox" name="mentorRecommends" class="${CHECK_BOX}"> Mentor Graduation Recommendation</label>
      </div>
      <div class="card p-6 space-y-4">
        <h3 class="font-medium">Closed Transactions (list up to ${esc(required)})</h3>
        <textarea name="closedTransactions" rows="5" placeholder="One per line: Address | Close Date | Sale Price | SkySlope File #" class="${INPUT}"></textarea>
      </div>
      <div class="card p-6 space-y-4">
        <h3 class="font-medium">Mentor Recommendation Statement</h3>
        <textarea name="mentorRecommendationStatement" rows="4" required placeholder="Why is this student ready to graduate?" class="${INPUT}"></textarea>
      </div>
      <div class="${ACTIONS_ROW}">
        <button type="submit" class="${SUBMIT_BTN}">Submit for Approval</button>
        ${cancelButton()}
      </div>
    </form>
  `;
  document.getElementById('graduation-form').onsubmit = async (e) => {
    e.preventDefault();
    const form = e.target;
    const data = Object.fromEntries(new FormData(form).entries());
    const transactions = data.closedTransactions
      ? data.closedTransactions.split('\n').map(s => s.trim()).filter(Boolean).map(line => {
          const parts = line.split('|').map(p => p.trim());
          const price = parts[2] ? Number(parts[2].replace(/[$,\s]/g, '')) : null;
          return {
            propertyAddress: parts[0] || '',
            closeDate: parts[1] || null,
            salePrice: Number.isFinite(price) ? price : null,
            skySlopeFileNumber: parts[3] || null,
          };
        })
      : [];
    const grad = {
      menteeId: data.menteeId,
      dateOfSubmission: data.dateOfSubmission,
      programStartDate: data.programStartDate || null,
      closedTransactionsConfirmed: !!data.closedTransactionsConfirmed,
      lightSpeedVtCompleted: !!data.lightSpeedVtCompleted,
      nexaLendingConnected: !!data.nexaLendingConnected,
      loftyCrmProficient: !!data.loftyCrmProficient,
      mentorRecommends: !!data.mentorRecommends,
      closedTransactions: transactions,
      mentorRecommendationStatement: data.mentorRecommendationStatement,
    };
    await runSubmit(form, async () => {
      // No longer sets the mentee to 'graduated': the admin approves it.
      await saveGraduation(grad);
      await loadFromSupabase();
      navigate('mentee', { menteeId: grad.menteeId });
      alert('Recommendation submitted. The program admin will review and approve it.');
    });
  };
}

// ---------------------------------------------------------------------------
export function renderFeedbackForm() {
  setHeader('Mentor Feedback', 'Record structured feedback on a mentee');
  const menteeOptions = menteeOptionsHtml(state.prefillMenteeId);
  dom.app.innerHTML = `
    ${noMenteesNotice()}
    <form id="feedback-form" class="max-w-3xl space-y-6">
      <div class="card p-6 space-y-4">
        <h3 class="font-medium">Feedback Details</h3>
        <div>
          <label class="block text-sm mb-1">Mentee</label>
          <select name="menteeId" required class="${INPUT}">${menteeOptions}</select>
        </div>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label class="block text-sm mb-1">Date</label>
            <input type="date" name="date" value="${today()}" required class="${INPUT}">
          </div>
          <div>
            <label class="block text-sm mb-1">Feedback Type</label>
            <select name="feedbackType" class="${INPUT}">
              <option value="general">General</option>
              <option value="strengths">Strengths Focus</option>
              <option value="areas_to_improve">Areas to Improve</option>
              <option value="session_recap">Session Recap</option>
              <option value="progress_note">Progress Note</option>
            </select>
          </div>
        </div>
      </div>
      <div class="card p-6 space-y-4">
        <h3 class="font-medium">Observations</h3>
        <div>
          <label class="block text-sm mb-1">Strengths</label>
          <textarea name="strengths" rows="3" placeholder="What is the mentee doing well?" class="${INPUT}"></textarea>
        </div>
        <div>
          <label class="block text-sm mb-1">Areas for Improvement</label>
          <textarea name="areasForImprovement" rows="3" placeholder="Where do they need to focus?" class="${INPUT}"></textarea>
        </div>
        <div>
          <label class="block text-sm mb-1">Specific Observations</label>
          <textarea name="specificObservations" rows="3" placeholder="Concrete examples from recent activity or conversations" class="${INPUT}"></textarea>
        </div>
      </div>
      <div class="card p-6 space-y-4">
        <h3 class="font-medium">Recommended Actions</h3>
        <textarea name="recommendedActions" rows="3" placeholder="What should the mentee do next?" class="${INPUT}"></textarea>
      </div>
      <div class="card p-6 space-y-4 mentor-only">
        <div class="flex flex-wrap items-center justify-between gap-2"><h3 class="font-medium">Mentor-only</h3>${MENTOR_ONLY_BADGE}</div>
        <div>
          <label class="block text-sm mb-1">Overall Rating (1–5)</label>
          <select name="overallRating" class="${INPUT}">
            <option value="">—</option>
            <option value="5">5 – Excellent</option>
            <option value="4">4 – Strong</option>
            <option value="3">3 – On track</option>
            <option value="2">2 – Needs support</option>
            <option value="1">1 – Significant concerns</option>
          </select>
        </div>
        <div>
          <label class="block text-sm mb-1">Private Notes (mentor only)</label>
          <textarea name="privateNotes" rows="2" placeholder="Internal notes not shared" class="${INPUT}"></textarea>
        </div>
      </div>
      ${shareToggle('sharedWithMentee', 'Share this feedback with the mentee',
        'They will see strengths, areas for improvement, observations and recommended actions. The rating and private notes are never shared.')}
      <div class="${ACTIONS_ROW}">
        <button type="submit" class="${SUBMIT_BTN}">Save Feedback</button>
        ${cancelButton()}
      </div>
    </form>
  `;
  document.getElementById('feedback-form').onsubmit = async (e) => {
    e.preventDefault();
    const form = e.target;
    const data = Object.fromEntries(new FormData(form).entries());
    const fb = {
      menteeId: data.menteeId,
      date: data.date,
      feedbackType: data.feedbackType || 'general',
      strengths: data.strengths || null,
      areasForImprovement: data.areasForImprovement || null,
      specificObservations: data.specificObservations || null,
      recommendedActions: data.recommendedActions || null,
      overallRating: data.overallRating ? Number(data.overallRating) : null,
      privateNotes: data.privateNotes || null,
      sharedWithMentee: !!data.sharedWithMentee,
    };
    await runSubmit(form, async () => {
      await saveFeedback(fb);
      await loadFromSupabase();
      navigate('dashboard');
    });
  };
}

// ---------------------------------------------------------------------------
export function renderKickoffForm() {
  setHeader('Kickoff Session', 'Capture the starting point and systems setup');
  const menteeOptions = menteeOptionsHtml(state.prefillMenteeId);
  dom.app.innerHTML = `
    ${noMenteesNotice()}
    <form id="kickoff-form" class="max-w-3xl space-y-6">
      <div class="card p-6 space-y-4">
        <h3 class="font-medium">Session</h3>
        <div>
          <label class="block text-sm mb-1">Mentee</label>
          <select name="menteeId" required class="${INPUT}">${menteeOptions}</select>
        </div>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label class="block text-sm mb-1">Date & Time</label>
            <input type="datetime-local" name="dateTime" required class="${INPUT}">
          </div>
          <div>
            <label class="block text-sm mb-1">Meeting Link</label>
            <input type="url" name="meetingLink" placeholder="https://..." class="${INPUT}">
          </div>
        </div>
      </div>
      <div class="card p-6 space-y-4">
        <h3 class="font-medium">The “Why” & Expectations</h3>
        <textarea name="studentWhyNotes" rows="3" placeholder="Student’s stated why" class="${INPUT}"></textarea>
        <textarea name="expectationsNotes" rows="3" placeholder="Program expectations covered" class="${INPUT}"></textarea>
      </div>
      <div class="card p-6 space-y-3">
        <h3 class="font-medium">Systems Activated</h3>
        <label class="${CHECK_LABEL}"><input type="checkbox" name="sys_lofty" class="${CHECK_BOX}"> Lofty CRM</label>
        <label class="${CHECK_LABEL}"><input type="checkbox" name="sys_vt" class="${CHECK_BOX}"> LightSpeed VT</label>
        <label class="${CHECK_LABEL}"><input type="checkbox" name="sys_nexa" class="${CHECK_BOX}"> Nexa Lending</label>
        <label class="${CHECK_LABEL}"><input type="checkbox" name="sys_skyslope" class="${CHECK_BOX}"> SkySlope</label>
      </div>
      <div class="card p-6 space-y-4">
        <h3 class="font-medium">Agreements</h3>
        <input type="text" name="agreedCheckInCadence" placeholder="e.g. Weekly on Tuesdays" class="${INPUT}">
        <textarea name="initialCommitment" rows="2" placeholder="First commitment" class="${INPUT}"></textarea>
        <input type="date" name="nextCheckInDate" class="${INPUT}">
      </div>
      <div class="text-xs text-navy-700/60">Kickoff sessions are visible to the mentee in their portal.</div>
      <div class="${ACTIONS_ROW}">
        <button type="submit" class="${SUBMIT_BTN}">Save Kickoff</button>
        ${cancelButton()}
      </div>
    </form>
  `;
  document.getElementById('kickoff-form').onsubmit = async (e) => {
    e.preventDefault();
    const form = e.target;
    const data = Object.fromEntries(new FormData(form).entries());
    const systems = [];
    if (data.sys_lofty) systems.push('Lofty CRM');
    if (data.sys_vt) systems.push('LightSpeed VT');
    if (data.sys_nexa) systems.push('Nexa Lending');
    if (data.sys_skyslope) systems.push('SkySlope');
    const k = {
      menteeId: data.menteeId,
      dateTime: data.dateTime ? new Date(data.dateTime).toISOString() : null,
      meetingLink: data.meetingLink || null,
      studentWhyNotes: data.studentWhyNotes || null,
      expectationsNotes: data.expectationsNotes || null,
      systemsActivated: systems,
      agreedCheckInCadence: data.agreedCheckInCadence || null,
      initialCommitment: data.initialCommitment || null,
      nextCheckInDate: data.nextCheckInDate || null,
    };
    await runSubmit(form, async () => {
      await saveKickoff(k);
      await loadFromSupabase();
      navigate('mentee', { menteeId: k.menteeId });
    });
  };
}

// ---------------------------------------------------------------------------
// md+: the original centered rounded card, no animation. Below md: a bottom
// sheet (.sheet / .sheet-backdrop in styles.css) that slides up, has a grab
// handle and rounded top corners, scrolls inside itself, and closes on the
// backdrop (data-backdrop) or Cancel.
export function modalShell(inner) {
  return `
    <div class="sheet-backdrop fixed inset-0 bg-navy-900/60 z-50 flex items-center justify-center p-4 max-md:p-0 max-md:items-end" data-action="close-modal" data-backdrop="1">
      <div class="sheet bg-white rounded-2xl p-6 w-full max-w-md max-md:max-w-none max-md:rounded-b-none max-md:rounded-t-3xl max-md:overflow-y-auto max-md:overscroll-contain" role="dialog" aria-modal="true" data-modal-body>
        <div class="sheet-handle md:hidden" aria-hidden="true"></div>
        ${inner}
      </div>
    </div>`;
}

export function openAddMenteeModal() {
  const modal = document.getElementById('modal-root');
  modal.innerHTML = modalShell(`
    <h3 class="font-display text-xl mb-4">Add Mentee</h3>
    <form id="new-mentee-form" class="space-y-3">
      <input name="fullName" placeholder="Full name" required class="${INPUT}">
      <input name="email" type="email" placeholder="Email (needed for the portal invite)" class="${INPUT}">
      <input name="phone" type="tel" autocomplete="tel" placeholder="Phone" class="${INPUT}">
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <input name="programStartDate" type="date" value="${today()}" class="${HALF_INPUT}">
        <select name="currentStage" class="${HALF_INPUT}">${stageOptionsHtml(1)}</select>
      </div>
      <textarea name="notes" placeholder="Private notes (mentor only)" rows="2" class="${INPUT}"></textarea>
      <div class="${MODAL_ACTIONS}">
        <button type="submit" class="btn-primary px-6 py-2 rounded-lg ${MODAL_BTN}">Create</button>
        <button type="button" data-action="close-modal" class="px-6 py-2 rounded-lg border ${MODAL_BTN}">Cancel</button>
      </div>
    </form>
  `);
  document.getElementById('new-mentee-form').onsubmit = async (e) => {
    e.preventDefault();
    const form = e.target;
    const data = Object.fromEntries(new FormData(form).entries());
    // No `id` here: saveMentee INSERTs and assigns the database id.
    const mentee = {
      fullName: data.fullName.trim(),
      email: data.email ? data.email.trim() : null,
      phone: data.phone || null,
      programStartDate: data.programStartDate || today(),
      currentStage: Number(data.currentStage) || 1,
      status: 'active',
      notes: data.notes || null,
    };
    await runSubmit(form, async () => {
      await saveMentee(mentee);
      // The mentee row exists now; a notes failure must not lead to a duplicate create.
      let notesErr = null;
      if (mentee.notes) {
        try {
          await saveMenteeNotes(mentee.id, mentee.notes);
        } catch (err) {
          notesErr = err;
        }
      }
      modal.innerHTML = '';
      await loadFromSupabase();
      navigate('mentee', { menteeId: mentee.id });
      if (notesErr) reportError(notesErr);
    });
  };
}

function stageOptionsHtml(selected) {
  const n = Math.max(Number(stageCount()) || 4, Number(selected) || 0);
  return Array.from({ length: n }, (_, i) => i + 1)
    .map(v => `<option value="${v}" ${Number(selected) === v ? 'selected' : ''}>Stage ${v}</option>`).join('');
}

const STATUS_OPTIONS = [
  ['active', 'Active'],
  ['paused', 'Paused'],
  ['escalated', 'Escalated'],
  ['dropped', 'Dropped'],
  ['graduated', 'Graduated'],
];

// Edit an existing mentee. Only the admin may pick 'graduated' (the DB trigger
// mentees_guard_graduation enforces it); mentors graduate via the recommendation.
// Private notes (mentee_private_notes) can only be written by the mentee's mentor.
export function openEditMenteeModal(id) {
  const m = state.mentees.find(x => x.id === id);
  if (!m) return;
  const canNotes = isMyMentee(m.id);
  const statusOpts = STATUS_OPTIONS
    .filter(([v]) => v !== 'graduated' || isAdmin() || m.status === 'graduated')
    .map(([v, label]) => `<option value="${v}" ${m.status === v ? 'selected' : ''}>${label}</option>`)
    .join('');
  const modal = document.getElementById('modal-root');
  modal.innerHTML = modalShell(`
    <h3 class="font-display text-xl mb-4">Edit Mentee</h3>
    <form id="edit-mentee-form" class="space-y-3">
      <input name="fullName" placeholder="Full name" required value="${esc(m.fullName)}" class="${INPUT}">
      <input name="email" type="email" placeholder="Email (needed for the portal invite)" value="${esc(m.email || '')}" class="${INPUT}">
      <input name="phone" type="tel" autocomplete="tel" placeholder="Phone" value="${esc(m.phone || '')}" class="${INPUT}">
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <input name="programStartDate" type="date" value="${esc(m.programStartDate || '')}" class="${HALF_INPUT}">
        <select name="currentStage" class="${HALF_INPUT}">${stageOptionsHtml(m.currentStage || 1)}</select>
      </div>
      <div>
        <label class="block text-sm mb-1">Status</label>
        <select name="status" class="${INPUT}">${statusOpts}</select>
        ${isAdmin() ? '' : '<div class="text-xs text-navy-700/60 mt-1">To graduate a mentee, submit a graduation recommendation; the program admin approves it.</div>'}
      </div>
      ${m.portalAccess !== 'none' ? '<div class="text-xs text-amber-800">Changing the email does not change the mentee’s portal login.</div>' : ''}
      ${canNotes ? `
        <div>
          <div class="mb-1">${MENTOR_ONLY_BADGE}</div>
          <textarea name="notes" placeholder="Private notes (mentor only)" rows="3" class="${INPUT}">${esc(m.notes || '')}</textarea>
        </div>` : ''}
      <div class="${MODAL_ACTIONS}">
        <button type="submit" class="btn-primary px-6 py-2 rounded-lg ${MODAL_BTN}">Save</button>
        <button type="button" data-action="close-modal" class="px-6 py-2 rounded-lg border ${MODAL_BTN}">Cancel</button>
      </div>
    </form>
  `);
  document.getElementById('edit-mentee-form').onsubmit = async (e) => {
    e.preventDefault();
    const form = e.target;
    const data = Object.fromEntries(new FormData(form).entries());
    const updated = {
      ...m,
      fullName: data.fullName.trim(),
      email: data.email ? data.email.trim() : null,
      phone: data.phone ? data.phone.trim() : null,
      programStartDate: data.programStartDate || null,
      currentStage: Number(data.currentStage) || m.currentStage || 1,
      status: data.status || m.status,
    };
    await runSubmit(form, async () => {
      if (!updated.fullName) throw new Error('Full name is required.');
      await saveMentee(updated, { previousStatus: m.status });
      if (canNotes) {
        const notes = (data.notes || '').trim();
        if (notes !== (m.notes || '').trim()) await saveMenteeNotes(m.id, notes || null);
      }
      modal.innerHTML = '';
      await loadFromSupabase();
    });
  };
}

// Mentor's own profile: shown to mentees on their Welcome / Account screens.
export function openProfileModal() {
  const p = state.profile || {};
  const modal = document.getElementById('modal-root');
  modal.innerHTML = modalShell(`
    <h3 class="font-display text-xl mb-1">Your profile</h3>
    <p class="text-sm text-navy-700/60 mb-4">Your mentees see this in their portal.</p>
    <form id="profile-form" class="space-y-3">
      <input name="full_name" placeholder="Full name" value="${esc(p.full_name || '')}" class="${INPUT}">
      <input name="phone" type="tel" autocomplete="tel" placeholder="Phone" value="${esc(p.phone || '')}" class="${INPUT}">
      <input name="booking_url" type="url" placeholder="Booking link (https://…)" value="${esc(p.booking_url || '')}" class="${INPUT}">
      <div class="${MODAL_ACTIONS}">
        <button type="submit" class="btn-primary px-6 py-2 rounded-lg ${MODAL_BTN}">Save</button>
        <button type="button" data-action="close-modal" class="px-6 py-2 rounded-lg border ${MODAL_BTN}">Cancel</button>
      </div>
    </form>
  `);
  document.getElementById('profile-form').onsubmit = async (e) => {
    e.preventDefault();
    const form = e.target;
    const data = Object.fromEntries(new FormData(form).entries());
    const booking = (data.booking_url || '').trim();
    await runSubmit(form, async () => {
      if (booking && !/^https:\/\//i.test(booking)) throw new Error('Booking link must start with https://');
      const fields = { full_name: data.full_name.trim() || null, phone: data.phone.trim() || null, booking_url: booking || null };
      await updateMyProfile(fields);
      state.profile = { ...p, ...fields };
      modal.innerHTML = '';
    });
  };
}
