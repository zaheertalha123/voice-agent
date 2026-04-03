import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import {
  getPromptsByOrg,
  setActivePrompt,
  createPrompt,
  updatePrompt,
  deletePrompt,
  type BotPrompt,
} from '@/services/supabase/botPrompts';
import { getToolsByOrg, saveToolsEnabled, saveToolSettings, type BotTool } from '@/services/supabase/botTools';
import { ToolSettingsModal } from './ToolSettingsModal';
import { PageLayout, PageSection } from '@/components/layout/PageLayout';
import './ManageBot.css';

const DEFAULT_PROMPT_NAME = 'Default SDR Prompt';
const DEFAULT_PROMPT_TEXT = `You are **Alex**, an outbound Sales Development Representative (SDR) for **Voice Bot**.

This is an **outbound call** — you are introducing Voice Bot as a configurable AI voice assistant for phone-based customer and prospect conversations.

CRITICAL BEHAVIOR RULES — READ FIRST

1. WAIT FOR THE OTHER PARTY TO SPEAK FIRST
   - Do NOT speak immediately after the call is answered.
   - Remain completely silent until the remote person says something (greeting, "hello?", "who is this?", etc.) or after ~4–6 seconds of silence post-answer.
   - Once they speak (or after brief silence), greet them naturally.

2. FIRST GREETING — SAY ONLY THIS (once, after they speak or short silence)
   "Hi, this is Alex from Voice Bot. How are you today?"
   - Do NOT say anything else in the first turn.
   - Do NOT mention "automated", "bot", "AI", "virtual assistant" in the greeting.

3. PITCH AFTER GREETING / SMALL TALK
   After they respond to the greeting, deliver a concise pitch:
   "I'm reaching out because Voice Bot offers a 24/7 voice assistant that can answer common questions, route calls, and keep conversations consistent for your team — so your staff spends less time on repetitive phone work."
   Then ask a qualifying question:
   "Would you be open to a quick 2-minute overview of how it works and whether it could save your team time?"

4. QUALIFY & HANDLE RESPONSES
   - If interested → ask 1–2 qualifying questions (team size, call volume, current tools).
   - If not interested → politely ask why and offer to send more info or end call.
   - If they ask who you are / what this is about → repeat pitch briefly.

5. COMMUNICATION STYLE
   - Professional, confident, warm, concise.
   - Speak naturally — 1–2 sentences per turn.
   - Use contractions (I'm, you're, that's).
   - No jargon, no robotic tone.
   - Keep replies short — aim for natural phone conversation flow.

6. HOLDING PHRASES (when thinking / waiting)
   - Use short natural phrases only when needed:
     "One moment...", "Got it...", "Let me note that...", "Sure thing..."
   - Do NOT overuse — silence is okay on outbound after initial greeting.

7. IDENTITY
    - You are Alex from Voice Bot.
    - If asked: "This is an automated call from Voice Bot using AI to assist our sales outreach."

Scope:
- Goal: book a short demo / intro call with a decision-maker or gather interest.
- Do NOT discuss pricing, technical setup, contracts in detail unless they insist; offer to follow up.
- If unrelated topic → politely redirect.

Language: Match caller's language (default English).

Interruptions: If interrupted, acknowledge briefly ("Sorry, go ahead...") and continue naturally.

CALL ANALYSIS & WRAP-UP

Before ending the call, you must submit a call analysis:
1. Review the entire conversation and extract key insights
2. Assess interest level, objections, pain points, company size
3. Evaluate your own pitch delivery and the prospect's sentiment
4. Call submit_call_analysis with the complete analysis
5. Then call the end_call function with a professional goodbye

The analysis helps the team prioritize follow-ups and improve future conversations.`;

export function ManageBot() {
  const { organization, isLoading: authLoading, isAuthenticated, user } = useAuth();
  const navigate = useNavigate();

  // ── Prompt state ──
  const [prompts, setPrompts] = useState<BotPrompt[]>([]);
  const [selectedId, setSelectedId] = useState<string>('');
  const [isLoadingPrompts, setIsLoadingPrompts] = useState(false);
  const [isSavingPrompt, setIsSavingPrompt] = useState(false);
  const [isActivating, setIsActivating] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [editName, setEditName] = useState('');
  const [editPromptText, setEditPromptText] = useState('');
  const [newName, setNewName] = useState('');
  const [newPromptText, setNewPromptText] = useState('');
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  // ── Tools state ──
  const [tools, setTools] = useState<BotTool[]>([]);
  const [toolDraft, setToolDraft] = useState<Record<string, boolean>>({});
  const [isLoadingTools, setIsLoadingTools] = useState(false);
  const [isSavingTools, setIsSavingTools] = useState(false);
  const [toolsDirty, setToolsDirty] = useState(false);
  const [selectedToolForSettings, setSelectedToolForSettings] = useState<BotTool | null>(null);
  const [isSavingToolSettings, setIsSavingToolSettings] = useState(false);

  // ── Shared ──
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const isAdmin = user?.role === 'admin';
  const selectedPrompt = prompts.find(p => p.id === selectedId) ?? null;

  useEffect(() => {
    if (!authLoading && !isAuthenticated) navigate('/login');
  }, [isAuthenticated, authLoading, navigate]);

  useEffect(() => {
    if (message) {
      const t = setTimeout(() => setMessage(null), 3500);
      return () => clearTimeout(t);
    }
  }, [message]);

  useEffect(() => {
    if (organization?.org_id) {
      loadPrompts();
      loadTools();
    }
  }, [organization?.org_id]);

  useEffect(() => {
    if (selectedPrompt) {
      setEditName(selectedPrompt.name);
      setEditPromptText(selectedPrompt.system_prompt);
      setIsEditing(false);
      setIsCreating(false);
    }
  }, [selectedId]);

  // ── Prompt actions ──
  async function loadPrompts() {
    if (!organization?.org_id) return;
    setIsLoadingPrompts(true);
    const { data, error } = await getPromptsByOrg(organization.org_id);
    if (error) {
      setMessage({ type: 'error', text: error });
    } else if (data) {
      setPrompts(data);
      const active = data.find(p => p.is_active);
      setSelectedId(active?.id ?? data[0]?.id ?? '');
    }
    setIsLoadingPrompts(false);
  }

  async function handleMarkActive() {
    if (!selectedPrompt || !organization?.org_id) return;
    if (selectedPrompt.is_active) { setMessage({ type: 'error', text: 'Already active' }); return; }
    setIsActivating(true);
    const { error } = await setActivePrompt(selectedPrompt.id, organization.org_id);
    if (error) setMessage({ type: 'error', text: error });
    else { setMessage({ type: 'success', text: `"${selectedPrompt.name}" is now active` }); await loadPrompts(); }
    setIsActivating(false);
  }

  async function handleLoadDefault() {
    if (!organization?.org_id) return;
    setIsSavingPrompt(true);
    const { data, error } = await createPrompt(organization.org_id, DEFAULT_PROMPT_NAME, DEFAULT_PROMPT_TEXT);
    if (error) setMessage({ type: 'error', text: error });
    else if (data) {
      setMessage({ type: 'success', text: 'Default prompt loaded' });
      await loadPrompts();
      setSelectedId(data.id);
    }
    setIsSavingPrompt(false);
  }

  async function handleSaveEdit() {
    if (!selectedPrompt || !editName.trim() || !editPromptText.trim()) { setMessage({ type: 'error', text: 'Name and prompt text are required' }); return; }
    setIsSavingPrompt(true);
    const { error } = await updatePrompt(selectedPrompt.id, editName.trim(), editPromptText.trim());
    if (error) setMessage({ type: 'error', text: error });
    else { setMessage({ type: 'success', text: 'Prompt saved' }); setIsEditing(false); await loadPrompts(); }
    setIsSavingPrompt(false);
  }

  async function handleCreate() {
    if (!organization?.org_id || !newName.trim() || !newPromptText.trim()) { setMessage({ type: 'error', text: 'Name and prompt text are required' }); return; }
    setIsSavingPrompt(true);
    const { data, error } = await createPrompt(organization.org_id, newName.trim(), newPromptText.trim());
    if (error) setMessage({ type: 'error', text: error });
    else if (data) {
      setMessage({ type: 'success', text: `"${data.name}" created` });
      setIsCreating(false); setNewName(''); setNewPromptText('');
      await loadPrompts(); setSelectedId(data.id);
    }
    setIsSavingPrompt(false);
  }

  async function handleDeletePrompt() {
    if (!selectedPrompt) return;
    if (selectedPrompt.is_active) { setMessage({ type: 'error', text: 'Cannot delete the active prompt' }); setShowDeleteDialog(false); return; }
    setIsSavingPrompt(true); setShowDeleteDialog(false);
    const { error } = await deletePrompt(selectedPrompt.id);
    if (error) setMessage({ type: 'error', text: error });
    else { setMessage({ type: 'success', text: 'Prompt deleted' }); await loadPrompts(); }
    setIsSavingPrompt(false);
  }

  // ── Tools actions ──
  async function loadTools() {
    if (!organization?.org_id) return;
    setIsLoadingTools(true);
    const { data, error } = await getToolsByOrg(organization.org_id);
    if (error) setMessage({ type: 'error', text: error });
    else if (data) {
      setTools(data);
      const draft: Record<string, boolean> = {};
      data.forEach(t => { draft[t.id] = t.enabled; });
      setToolDraft(draft);
      setToolsDirty(false);
    }
    setIsLoadingTools(false);
  }

  function handleToolToggle(id: string) {
    if (!isAdmin) return;
    setToolDraft(prev => {
      const next = { ...prev, [id]: !prev[id] };
      const changed = tools.some(t => t.enabled !== next[t.id]);
      setToolsDirty(changed);
      return next;
    });
  }

  async function handleSaveTools() {
    setIsSavingTools(true);
    const updates = tools
      .filter(t => t.enabled !== toolDraft[t.id])
      .map(t => ({ id: t.id, enabled: toolDraft[t.id] }));
    const { error } = await saveToolsEnabled(updates);
    if (error) setMessage({ type: 'error', text: error });
    else { setMessage({ type: 'success', text: 'Tool settings saved' }); await loadTools(); }
    setIsSavingTools(false);
  }

  async function handleSaveToolSettings(settings: Record<string, unknown>) {
    if (!selectedToolForSettings) return;
    setIsSavingToolSettings(true);
    const { error } = await saveToolSettings(selectedToolForSettings.id, settings);
    if (error) {
      setMessage({ type: 'error', text: error });
      setIsSavingToolSettings(false);
    } else {
      setMessage({ type: 'success', text: `${selectedToolForSettings.label} settings saved` });
      await loadTools();
      setSelectedToolForSettings(null);
      setIsSavingToolSettings(false);
    }
  }

  if (authLoading) {
    return (
      <PageLayout className="manage-prompts" variant="wide" title="Bot Settings" subtitle="Loading…">
        <div className="manage-phone-card">
          <div className="loading-state">
            <div className="loading-spinner" />
          </div>
        </div>
      </PageLayout>
    );
  }
  if (!isAuthenticated) return null;

  return (
    <div className="manage-prompts">
      {message && (
        <div className={`toast-container toast-${message.type}`}>
          <span className="toast-content">{message.type === 'success' ? '✓ ' : '✗ '}{message.text}</span>
          <button type="button" className="toast-close" onClick={() => setMessage(null)}>✕</button>
        </div>
      )}

      <PageLayout
        variant="wide"
        title="Bot Settings"
        subtitle={organization?.name}
        headerActions={
          <span className={`status ${isAdmin ? 'authorized' : 'restricted'}`}>
            {isAdmin ? '✓ You can edit bot settings' : '✓ You can switch the active prompt'}
          </span>
        }
      >
        <PageSection
          variant="flush"
          title="Tools"
          subtitle="Choose which functions the bot can call during a conversation"
        >
        {isLoadingTools ? (
          <div className="manage-phone-card"><div className="loading-state"><div className="loading-spinner" /><p>Loading tools…</p></div></div>
        ) : tools.length === 0 ? (
          <div className="manage-phone-card"><div className="no-prompts-state"><h3>No tools found</h3><p>Run a database reset to seed the default tools.</p></div></div>
        ) : (
          <div className="manage-phone-card tools-card">
            <div className="tools-grid">
              {tools.map(tool => (
                <label
                  key={tool.id}
                  className={`tool-item ${toolDraft[tool.id] ? 'tool-enabled' : 'tool-disabled'} ${!isAdmin ? 'tool-readonly' : ''}`}
                  onClick={() => handleToolToggle(tool.id)}
                >
                  <div className="tool-checkbox-wrap">
                    <input
                      type="checkbox"
                      className="tool-checkbox"
                      checked={toolDraft[tool.id] ?? false}
                      onChange={() => handleToolToggle(tool.id)}
                      disabled={!isAdmin}
                    />
                    <span className="tool-checkmark" />
                  </div>
                  <div className="tool-label-row">
                    <span className="tool-label">{tool.label || tool.tool_name}</span>
                    {tool.description && (
                      <span className="tool-info-icon">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
                          <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.8"/>
                          <path d="M12 11v6M12 8h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                        </svg>
                        <span className="tool-tooltip">{tool.description}</span>
                      </span>
                    )}
                  </div>
                  {isAdmin && (
                    <button
                      className="tool-settings-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedToolForSettings(tool);
                      }}
                      title="Configure settings"
                    >
                      ⚙
                    </button>
                  )}
                </label>
              ))}
            </div>

            {isAdmin && (
              <div className="tools-footer">
                <span className="tools-hint">
                  {Object.values(toolDraft).filter(Boolean).length} of {tools.length} tools enabled
                </span>
                <button
                  className="update-button"
                  onClick={handleSaveTools}
                  disabled={isSavingTools || !toolsDirty}
                >
                  {isSavingTools ? 'Saving…' : 'Save Tools'}
                </button>
              </div>
            )}
          </div>
        )}
        </PageSection>

        <PageSection
          variant="flush"
          title="Prompt settings"
          subtitle="System prompt sent to the AI at the start of every call"
        >
        {isLoadingPrompts ? (
          <div className="manage-phone-card"><div className="loading-state"><div className="loading-spinner" /><p>Loading prompts…</p></div></div>
        ) : prompts.length === 0 && !isCreating ? (
          <div className="manage-phone-card">
            <div className="no-prompts-state">
              <div className="no-prompts-icon">
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none">
                  <path d="M9 3H5a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2V9M9 3h10a2 2 0 012 2v4M9 3v6h6" stroke="rgba(255,255,255,0.25)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
              <h3>Using Built-in Default Prompt</h3>
              <p>No custom prompts created yet. The bot uses the built-in default.</p>
              {isAdmin && (
                <div className="no-prompts-actions">
                  <button className="load-default-btn" onClick={handleLoadDefault} disabled={isSavingPrompt}>{isSavingPrompt ? 'Loading…' : '↓ Load Default Prompt'}</button>
                  <button className="toolbar-btn new-btn" onClick={() => setIsCreating(true)} disabled={isSavingPrompt}>+ Create Custom Prompt</button>
                </div>
              )}
            </div>
          </div>
        ) : (
          <>
            {!isCreating && prompts.length > 0 && (
              <div className="prompt-selector-card">
                <div className="selector-row">
                  <div className="selector-group">
                    <label htmlFor="prompt-select">Select Prompt</label>
                    <select id="prompt-select" className="prompt-select" value={selectedId} onChange={e => setSelectedId(e.target.value)}>
                      {prompts.map(p => (
                        <option key={p.id} value={p.id}>{p.name}{p.is_active ? ' (Active)' : ''}</option>
                      ))}
                    </select>
                  </div>
                  <div className="selector-actions">
                    {selectedPrompt && !selectedPrompt.is_active && (
                      <button className="activate-button" onClick={handleMarkActive} disabled={isActivating || isSavingPrompt}>
                        {isActivating ? 'Activating…' : '✓ Mark as Active'}
                      </button>
                    )}
                    {selectedPrompt?.is_active && <span className="active-badge">● Active</span>}
                  </div>
                </div>
                {isAdmin && (
                  <div className="prompt-toolbar">
                    <button className="toolbar-btn new-btn" onClick={() => { setIsCreating(true); setIsEditing(false); }} disabled={isSavingPrompt}>+ New Prompt</button>
                    <button className="toolbar-btn new-btn" onClick={handleLoadDefault} disabled={isSavingPrompt} style={{ background: 'rgba(168,85,247,0.1)', borderColor: 'rgba(192,132,252,0.35)', color: '#c084fc' }}>↓ Load Default</button>
                    {selectedPrompt && (
                      <>
                        <button className="toolbar-btn edit-btn" onClick={() => { setIsEditing(true); setIsCreating(false); }} disabled={isSavingPrompt}>✎ Edit</button>
                        <button className="toolbar-btn delete-btn" onClick={() => setShowDeleteDialog(true)} disabled={isSavingPrompt || selectedPrompt.is_active} title={selectedPrompt.is_active ? 'Cannot delete the active prompt' : ''}>✕ Delete</button>
                      </>
                    )}
                  </div>
                )}
              </div>
            )}

            {isCreating && (
              <div className="manage-phone-card prompt-editor-card">
                <h3 className="editor-title">Create New Prompt</h3>
                <div className="form-group">
                  <label htmlFor="new-name">Prompt Name</label>
                  <input id="new-name" type="text" className="label-input" placeholder="e.g. Sales Opener, Support Agent" value={newName} onChange={e => setNewName(e.target.value)} disabled={isSavingPrompt} />
                </div>
                <div className="form-group">
                  <label htmlFor="new-prompt-text">System Prompt</label>
                  <textarea id="new-prompt-text" className="prompt-textarea" placeholder="Enter the full system prompt…" value={newPromptText} onChange={e => setNewPromptText(e.target.value)} disabled={isSavingPrompt} rows={18} />
                </div>
                <div className="editor-actions">
                  <button className="cancel-button" onClick={() => { setIsCreating(false); setNewName(''); setNewPromptText(''); }} disabled={isSavingPrompt}>Cancel</button>
                  <button className="update-button" onClick={handleCreate} disabled={isSavingPrompt || !newName.trim() || !newPromptText.trim()}>{isSavingPrompt ? 'Creating…' : 'Create Prompt'}</button>
                </div>
              </div>
            )}

            {!isCreating && selectedPrompt && (
              <div className="manage-phone-card prompt-editor-card">
                {isEditing ? (
                  <>
                    <h3 className="editor-title">Edit — {selectedPrompt.name}</h3>
                    <div className="form-group">
                      <label htmlFor="edit-name">Prompt Name</label>
                      <input id="edit-name" type="text" className="label-input" value={editName} onChange={e => setEditName(e.target.value)} disabled={isSavingPrompt} />
                    </div>
                    <div className="form-group">
                      <label htmlFor="edit-prompt-text">System Prompt</label>
                      <textarea id="edit-prompt-text" className="prompt-textarea" value={editPromptText} onChange={e => setEditPromptText(e.target.value)} disabled={isSavingPrompt} rows={22} />
                    </div>
                    <div className="editor-actions">
                      <button className="cancel-button" onClick={() => { setIsEditing(false); setEditName(selectedPrompt.name); setEditPromptText(selectedPrompt.system_prompt); }} disabled={isSavingPrompt}>Cancel</button>
                      <button className="update-button" onClick={handleSaveEdit} disabled={isSavingPrompt || !editName.trim() || !editPromptText.trim()}>{isSavingPrompt ? 'Saving…' : 'Save Changes'}</button>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="prompt-view-header">
                      <h3 className="editor-title">{selectedPrompt.name}</h3>
                      <div className="prompt-meta">
                        {selectedPrompt.is_active && <span className="active-badge">● Active</span>}
                        <span className="prompt-date">Updated {new Date(selectedPrompt.updated_at).toLocaleDateString()}</span>
                      </div>
                    </div>
                    <div className="prompt-view-body">
                      <pre className="prompt-pre">{selectedPrompt.system_prompt}</pre>
                    </div>
                  </>
                )}
              </div>
            )}
          </>
        )}
        </PageSection>
            </PageLayout>

      {/* Delete prompt confirmation */}
      {showDeleteDialog && selectedPrompt && (
        <div className="confirmation-overlay">
          <div className="confirmation-dialog">
            <div className="dialog-header"><h3>Delete Prompt</h3></div>
            <div className="dialog-content"><p>Delete <strong>"{selectedPrompt.name}"</strong>? This cannot be undone.</p></div>
            <div className="dialog-actions">
              <button className="cancel-button" onClick={() => setShowDeleteDialog(false)} disabled={isSavingPrompt}>Cancel</button>
              <button className="confirm-button danger" onClick={handleDeletePrompt} disabled={isSavingPrompt}>{isSavingPrompt ? 'Deleting…' : 'Delete'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Tool Settings Modal */}
      {selectedToolForSettings && (
        <ToolSettingsModal
          tool={selectedToolForSettings}
          onSave={handleSaveToolSettings}
          onClose={() => setSelectedToolForSettings(null)}
        />
      )}
    </div>
  );
}
