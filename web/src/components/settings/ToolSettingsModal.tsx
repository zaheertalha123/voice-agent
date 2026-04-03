import React, { useState } from "react";
import { BotTool } from "@/services/supabase/botTools";
import { validatePhoneNumber } from "@/utils/phoneValidation";
import "./ToolSettingsModal.css";

interface ToolSettingsModalProps {
  tool: BotTool;
  onSave: (settings: Record<string, unknown>) => Promise<void>;
  onClose: () => void;
}

const ANALYSIS_OPTIONS = [
  { key: "interest_level",              label: "Interest Level",            sub: "high / medium / low / none", required: true },
  { key: "qualified_lead",              label: "Lead Qualification",        sub: "is this a qualified lead?",  required: true },
  { key: "call_sentiment",              label: "Call Sentiment",            sub: "overall score 0–100",        required: true },
  { key: "pitch_delivery_score",        label: "Pitch Delivery",            sub: "quality score 0–100",        required: true },
  { key: "want_demo",                   label: "Demo Interest",             sub: "did they ask for a demo?" },
  { key: "transferred_to_human",        label: "Transfer Status",           sub: "was the call transferred?" },
  { key: "demo_booked",                 label: "Demo Booked",               sub: "confirmed booking outcome" },
  { key: "objections",                  label: "Objections",                sub: "objections raised by prospect" },
  { key: "pain_points_mentioned",       label: "Pain Points",               sub: "pain points they mentioned" },
  { key: "company_size_category",       label: "Company Size",              sub: "SMB / mid-market / enterprise" },
  { key: "customer_satisfaction_estimate", label: "Customer Satisfaction",  sub: "estimated satisfaction 0–100" },
  { key: "extracted_info",              label: "Extracted Info",            sub: "decision maker, provider, etc." },
];

const TOOL_META: Record<string, { icon: string; color: string; description: string }> = {
  end_call: {
    icon: "☎",
    color: "#5a7aff",
    description: "Gracefully ends the call with a farewell message after the conversation concludes.",
  },
  transfer_to_human: {
    icon: "⇌",
    color: "#a07aff",
    description: "Transfers the caller to a live agent when they request it or show strong buying intent.",
  },
  submit_call_analysis: {
    icon: "◈",
    color: "#7ad4ff",
    description: "Records structured insights about the call before it ends for sales team review.",
  },
  send_email: {
    icon: "✉",
    color: "#7affb8",
    description: "Sends a follow-up email when the prospect asks for more information.",
  },
};

export function ToolSettingsModal({ tool, onSave, onClose }: ToolSettingsModalProps) {
  const [formData, setFormData] = useState(tool.settings || {});
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const meta = TOOL_META[tool.tool_name] ?? { icon: "⚙", color: "#f59e0b", description: "" };

  const selectedFields = (formData.selected_fields || []) as string[];

  function toggleField(key: string) {
    if (selectedFields.includes(key)) {
      setFormData({ ...formData, selected_fields: selectedFields.filter((k) => k !== key) });
    } else {
      setFormData({ ...formData, selected_fields: [...selectedFields, key] });
    }
  }

  const handleSave = async () => {
    try {
      setError(null);
      setLoading(true);

      if (tool.tool_name === "transfer_to_human") {
        const transferNumber = (formData.transfer_number || "").toString().trim();
        if (transferNumber) {
          const validation = validatePhoneNumber(transferNumber);
          if (!validation.isValid) {
            setError(validation.error || "Invalid phone number");
            setLoading(false);
            return;
          }
          formData.transfer_number = validation.normalized;
        }
      }

      if (tool.tool_name === "send_email") {
        const recipients = (formData.recipient_emails || "").toString().trim();
        const subject   = (formData.subject || "").toString().trim();
        const body      = (formData.body || "").toString().trim();

        if (!recipients) { setError("At least one recipient email is required"); setLoading(false); return; }
        if (!subject)    { setError("Subject is required");                      setLoading(false); return; }
        if (!body)       { setError("Email body is required");                   setLoading(false); return; }

        const emailList = recipients.split(",").map((e) => e.trim());
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        for (const email of emailList) {
          if (!emailRegex.test(email)) { setError(`Invalid email: ${email}`); setLoading(false); return; }
        }

        const bodyWordCount = body.split(/\s+/).length;
        if (bodyWordCount > 500) {
          setError(`Email body exceeds 500 words (current: ${bodyWordCount} words)`);
          setLoading(false);
          return;
        }
      }

      await onSave(formData);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save tool settings");
    } finally {
      setLoading(false);
    }
  };

  const wordCount = (formData.body || "").toString().trim()
    ? (formData.body || "").toString().trim().split(/\s+/).length
    : 0;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>

        {/* ── Header ── */}
        <div className="modal-header">
          <div className="modal-header-left">
            <span className="modal-tool-icon" style={{ color: meta.color }}>{meta.icon}</span>
            <div>
              <h2 className="modal-title">{tool.label}</h2>
              <p className="modal-subtitle">{meta.description}</p>
            </div>
          </div>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        {/* ── Accent bar ── */}
        <div className="modal-accent-bar" style={{ background: `linear-gradient(90deg, ${meta.color}55, transparent)` }} />

        {/* ── Body ── */}
        <div className="modal-body">
          {error && <div className="error-message">{error}</div>}

          {/* ── End Call ── */}
          {tool.tool_name === "end_call" && (
            <div className="no-settings">
              <span className="no-settings-icon" style={{ color: meta.color }}>☎</span>
              <p>No configurable settings for this tool.</p>
              <p className="description">
                When the conversation ends, the bot says a short farewell and the call disconnects automatically.
              </p>
            </div>
          )}

          {/* ── Transfer to Human ── */}
          {tool.tool_name === "transfer_to_human" && (
            <div className="form-group">
              <label className="field-label">
                Transfer Phone Number
                <span className="field-optional">optional</span>
              </label>
              <p className="field-desc">
                Calls will be forwarded to this number. Leave blank to use the default SIP transfer.
              </p>
              <div className="input-prefix-wrap">
                <span className="input-prefix">+</span>
                <input
                  type="text"
                  placeholder="1 (555) 123-4567 or 5551234567"
                  value={(formData.transfer_number || "").toString()}
                  onChange={(e) => setFormData({ ...formData, transfer_number: e.target.value })}
                  className="input-field has-prefix"
                />
              </div>
              <small className="hint">
                10-digit numbers without a country code get +1 added automatically.
              </small>
            </div>
          )}

          {/* ── Submit Call Analysis ── */}
          {tool.tool_name === "submit_call_analysis" && (
            <div className="form-group">
              <div className="analysis-header">
                <label className="field-label">Metrics to capture</label>
                <span className="analysis-count">
                  {selectedFields.length} / {ANALYSIS_OPTIONS.length} selected
                </span>
              </div>
              <p className="field-desc">
                Select which data points the bot collects and stores after each call.
              </p>

              <div className="option-chips">
                {ANALYSIS_OPTIONS.map((option) => {
                  const isSelected = selectedFields.includes(option.key) || !!option.required;
                  return (
                    <button
                      key={option.key}
                      type="button"
                      className={`option-chip ${isSelected ? "chip-selected" : ""} ${option.required ? "chip-required" : ""}`}
                      onClick={() => !option.required && toggleField(option.key)}
                      disabled={!!option.required}
                      title={option.required ? "Always captured — required metric" : undefined}
                    >
                      <span className="chip-check">{isSelected ? "✓" : ""}</span>
                      <span className="chip-body">
                        <span className="chip-label">{option.label}</span>
                        <span className="chip-sub">{option.sub}</span>
                      </span>
                      {option.required && <span className="chip-badge">Required</span>}
                    </button>
                  );
                })}
              </div>

              <small className="hint">
                Required fields are always saved regardless of your selection.
              </small>
            </div>
          )}

          {/* ── Send Email ── */}
          {tool.tool_name === "send_email" && (
            <>
              <div className="form-group">
                <label className="field-label">
                  Recipient Emails <span className="required">*</span>
                </label>
                <input
                  type="text"
                  placeholder="email1@example.com, email2@example.com"
                  value={(formData.recipient_emails || "").toString()}
                  onChange={(e) => setFormData({ ...formData, recipient_emails: e.target.value })}
                  className="input-field"
                />
                <small className="hint">Separate multiple addresses with commas.</small>
              </div>

              <div className="form-group">
                <label className="field-label">
                  Subject <span className="required">*</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g., Follow-up from our call"
                  value={(formData.subject || "").toString()}
                  onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
                  className="input-field"
                />
              </div>

              <div className="form-group">
                <div className="textarea-label-row">
                  <label className="field-label">
                    Email Body <span className="required">*</span>
                  </label>
                  <span className={`word-count ${wordCount > 450 ? "word-count-warn" : ""}`}>
                    {wordCount} / 500 words
                  </span>
                </div>
                <textarea
                  placeholder="Write the email template…"
                  value={(formData.body || "").toString()}
                  onChange={(e) => setFormData({ ...formData, body: e.target.value })}
                  className="textarea-field"
                  rows={6}
                  maxLength={2000}
                />
                <small className="hint">
                  Dynamic placeholders: <code>[caller_name]</code>, <code>[company]</code>, <code>[note]</code>
                </small>
              </div>
            </>
          )}
        </div>

        {/* ── Footer ── */}
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose} disabled={loading}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={handleSave} disabled={loading}>
            {loading ? "Saving…" : "Save Settings"}
          </button>
        </div>

      </div>
    </div>
  );
}
