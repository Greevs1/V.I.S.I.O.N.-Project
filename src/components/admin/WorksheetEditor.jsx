import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  Trash2, GripVertical, Eye, Save, Bold, Italic, Underline,
  AlignLeft, AlignCenter, AlignRight, Type, List, Minus,
  ChevronDown, Plus, Loader2, PenLine, Hash, Calendar,
  CheckSquare, ListOrdered, FileText, AlignJustify, Check, UserPlus
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';

const FIELD_TYPES = [
  { value: 'heading', label: 'Heading', icon: Hash },
  { value: 'paragraph', label: 'Paragraph', icon: AlignJustify },
  { value: 'divider', label: 'Divider', icon: Minus },
  { value: 'text', label: 'Text Input', icon: Type },
  { value: 'textarea', label: 'Text Area', icon: AlignLeft },
  { value: 'number', label: 'Number', icon: Hash },
  { value: 'date', label: 'Date', icon: Calendar },
  { value: 'dropdown', label: 'Dropdown', icon: ChevronDown },
  { value: 'checkbox', label: 'Checkbox', icon: CheckSquare },
  { value: 'signature', label: 'Signature', icon: PenLine },
];

const TYPE_LABELS = {
  text: 'text', textarea: 'area', number: 'num', date: 'date',
  dropdown: 'drop', checkbox: 'check', signature: 'sign',
  heading: 'H', paragraph: 'p', divider: '—',
};

function genId() { return Math.random().toString(36).slice(2, 8); }

// ─── Rich Text Toolbar ─────────────────────────────────────────────────────
function RichToolbar({ onFormat }) {
  const cmd = (command, value) => { document.execCommand(command, false, value); };

  const FONT_SIZES = ['12px', '14px', '16px', '18px', '20px', '24px', '28px', '32px'];
  const FONT_FAMILIES = ['Inter', 'Georgia', 'Courier New', 'Arial', 'Times New Roman'];
  const [fontSize, setFontSize] = useState('16px');
  const [fontFamily, setFontFamily] = useState('Inter');

  const applyFontSize = (size) => {
    setFontSize(size);
    document.execCommand('styleWithCSS', false, true);
    document.execCommand('fontSize', false, '7');
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0) {
      const range = sel.getRangeAt(0);
      const spans = document.querySelectorAll('font[size="7"]');
      spans.forEach(s => { s.removeAttribute('size'); s.style.fontSize = size; });
    }
  };

  const applyFont = (family) => {
    setFontFamily(family);
    document.execCommand('fontName', false, family);
  };

  const COLORS = ['#ffffff', '#D4A853', '#00D4FF', '#22c55e', '#ef4444', '#a855f7', '#f97316', '#64748b'];

  return (
    <div className="flex items-center gap-0.5 px-3 py-1.5 border-b border-border bg-card flex-wrap">
      {/* Font family */}
      <select
        value={fontFamily}
        onChange={e => applyFont(e.target.value)}
        className="text-xs bg-secondary border border-border rounded px-1.5 py-1 outline-none mr-1 h-6"
        style={{ fontSize: 11 }}
      >
        {FONT_FAMILIES.map(f => <option key={f} value={f}>{f}</option>)}
      </select>

      {/* Font size */}
      <select
        value={fontSize}
        onChange={e => applyFontSize(e.target.value)}
        className="text-xs bg-secondary border border-border rounded px-1.5 py-1 outline-none mr-1 h-6 w-16"
        style={{ fontSize: 11 }}
      >
        {FONT_SIZES.map(s => <option key={s} value={s}>{s.replace('px', '')}</option>)}
      </select>

      <div className="w-px h-4 bg-border mx-1" />

      {/* Style buttons */}
      {[
        { icon: Bold, cmd: 'bold', title: 'Bold' },
        { icon: Italic, cmd: 'italic', title: 'Italic' },
        { icon: Underline, cmd: 'underline', title: 'Underline' },
      ].map(({ icon: Icon, cmd: c, title }) => (
        <button
          key={c}
          onMouseDown={e => { e.preventDefault(); cmd(c); }}
          title={title}
          className="p-1 rounded hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
        >
          <Icon className="w-3.5 h-3.5" />
        </button>
      ))}

      <div className="w-px h-4 bg-border mx-1" />

      {/* Alignment */}
      {[
        { icon: AlignLeft, cmd: 'justifyLeft', title: 'Align Left' },
        { icon: AlignCenter, cmd: 'justifyCenter', title: 'Center' },
        { icon: AlignRight, cmd: 'justifyRight', title: 'Align Right' },
      ].map(({ icon: Icon, cmd: c, title }) => (
        <button
          key={c}
          onMouseDown={e => { e.preventDefault(); cmd(c); }}
          title={title}
          className="p-1 rounded hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
        >
          <Icon className="w-3.5 h-3.5" />
        </button>
      ))}

      <div className="w-px h-4 bg-border mx-1" />

      {/* Lists */}
      <button
        onMouseDown={e => { e.preventDefault(); cmd('insertUnorderedList'); }}
        title="Bullet List"
        className="p-1 rounded hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
      >
        <List className="w-3.5 h-3.5" />
      </button>
      <button
        onMouseDown={e => { e.preventDefault(); cmd('insertOrderedList'); }}
        title="Numbered List"
        className="p-1 rounded hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
      >
        <ListOrdered className="w-3.5 h-3.5" />
      </button>

      <div className="w-px h-4 bg-border mx-1" />

      {/* Headings */}
      {['H1', 'H2', 'H3'].map(h => (
        <button
          key={h}
          onMouseDown={e => { e.preventDefault(); cmd('formatBlock', h.toLowerCase()); }}
          className="px-1.5 py-0.5 text-[10px] font-bold rounded hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
        >
          {h}
        </button>
      ))}

      <button
        onMouseDown={e => { e.preventDefault(); cmd('formatBlock', 'p'); }}
        className="px-1.5 py-0.5 text-[10px] rounded hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
      >
        P
      </button>

      <div className="w-px h-4 bg-border mx-1" />

      {/* Color swatches */}
      <div className="flex items-center gap-0.5">
        {COLORS.map(color => (
          <button
            key={color}
            onMouseDown={e => { e.preventDefault(); cmd('styleWithCSS', false, true); cmd('foreColor', color); }}
            title={color}
            className="w-4 h-4 rounded-sm border border-border/50 hover:scale-110 transition-transform"
            style={{ backgroundColor: color }}
          />
        ))}
      </div>
    </div>
  );
}

// ─── Rich Text Content Block ────────────────────────────────────────────────
function RichTextBlock({ value, onChange, placeholder, minHeight = 40 }) {
  const ref = useRef(null);
  const [focused, setFocused] = useState(false);

  const handleInput = useCallback(() => {
    if (ref.current) onChange(ref.current.innerHTML);
  }, [onChange]);

  return (
    <div
      ref={ref}
      contentEditable
      suppressContentEditableWarning
      onInput={handleInput}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      dangerouslySetInnerHTML={{ __html: value || '' }}
      className={`w-full bg-transparent text-sm outline-none transition-colors px-1 py-1 rounded ${
        focused ? 'ring-1 ring-primary/30' : ''
      } ${!value && !focused ? 'text-muted-foreground' : ''}`}
      style={{ minHeight, wordBreak: 'break-word', lineHeight: 1.6 }}
      data-placeholder={placeholder}
    />
  );
}

// ─── Field Editor ───────────────────────────────────────────────────────────
function FieldEditor({ field, idx, onChange, onRemove, provided }) {
  const isLayout = ['heading', 'paragraph', 'divider'].includes(field.type);

  return (
    <div
      ref={provided.innerRef}
      {...provided.draggableProps}
      className={`rounded-lg border bg-card transition-colors group ${
        isLayout ? 'border-border/50' : 'border-border hover:border-primary/30'
      }`}
    >
      {/* Drag handle + header */}
      <div className="flex items-center gap-2 px-3 pt-3 pb-2">
        <div {...provided.dragHandleProps} className="cursor-grab active:cursor-grabbing text-muted-foreground/30 hover:text-muted-foreground transition-colors shrink-0">
          <GripVertical className="w-4 h-4" />
        </div>

        {field.type === 'divider' ? (
          <div className="flex-1 h-px bg-border" />
        ) : field.type === 'heading' ? (
          <input
            value={field.label}
            onChange={e => onChange({ label: e.target.value })}
            placeholder="Heading text..."
            className="flex-1 text-xl font-display font-semibold bg-transparent outline-none border-b border-transparent focus:border-primary/50 transition-colors"
          />
        ) : field.type === 'paragraph' ? (
          <div className="flex-1 text-xs text-muted-foreground italic">Paragraph block (see content below)</div>
        ) : (
          <input
            value={field.label}
            onChange={e => onChange({ label: e.target.value })}
            placeholder="Field label..."
            className="flex-1 text-sm font-medium bg-transparent outline-none border-b border-transparent focus:border-primary/50 transition-colors"
          />
        )}

        {!isLayout && (
          <>
            <span className="text-[10px] border border-border rounded px-1.5 py-0.5 text-muted-foreground shrink-0">
              {TYPE_LABELS[field.type] || field.type}
            </span>
            <label className="flex items-center gap-1 text-xs text-muted-foreground shrink-0 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={field.required || false}
                onChange={e => onChange({ required: e.target.checked })}
                className="w-3 h-3"
              />
              Req
            </label>
          </>
        )}

        <button
          onClick={onRemove}
          className="text-muted-foreground/0 group-hover:text-muted-foreground hover:!text-destructive transition-colors shrink-0"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Paragraph content (rich text) */}
      {field.type === 'paragraph' && (
        <div className="px-3 pb-3">
          <RichTextBlock
            value={field.content || ''}
            onChange={v => onChange({ content: v })}
            placeholder="Type paragraph content... (supports rich text)"
            minHeight={60}
          />
        </div>
      )}

      {/* Placeholder for input types */}
      {!isLayout && field.type !== 'checkbox' && field.type !== 'signature' && (
        <div className="px-3 pb-3">
          <input
            value={field.placeholder || ''}
            onChange={e => onChange({ placeholder: e.target.value })}
            placeholder="Placeholder hint (optional)..."
            className="w-full text-xs bg-secondary border border-border rounded px-3 py-1.5 outline-none focus:border-primary/50 text-muted-foreground"
          />
        </div>
      )}

      {/* Dropdown options */}
      {field.type === 'dropdown' && (
        <div className="px-3 pb-3 space-y-1.5">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Options</p>
          {(field.options || []).map((opt, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                value={opt}
                onChange={e => {
                  const newOpts = [...(field.options || [])];
                  newOpts[i] = e.target.value;
                  onChange({ options: newOpts });
                }}
                className="flex-1 text-xs bg-secondary border border-border rounded px-2 py-1 outline-none focus:border-primary/50"
              />
              <button
                onClick={() => onChange({ options: (field.options || []).filter((_, j) => j !== i) })}
                className="text-muted-foreground hover:text-destructive"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          ))}
          <button
            onClick={() => onChange({ options: [...(field.options || []), `Option ${(field.options || []).length + 1}`] })}
            className="text-xs text-primary hover:underline"
          >
            + Add option
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Preview ────────────────────────────────────────────────────────────────
function WorksheetPreview({ title, description, fields, onBack }) {
  const [answers, setAnswers] = useState({});
  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-5 py-3 border-b border-border shrink-0">
        <h3 className="text-sm font-semibold">Preview: {title}</h3>
        <Button variant="outline" size="sm" className="h-7 text-xs" onClick={onBack}>← Back to Editor</Button>
      </div>
      <div className="flex-1 overflow-y-auto p-8 space-y-5 max-w-2xl mx-auto w-full">
        <h1 className="text-2xl font-display font-bold">{title}</h1>
        {description && (
          <div className="text-sm text-muted-foreground" dangerouslySetInnerHTML={{ __html: description }} />
        )}
        {fields.map(field => {
          if (field.type === 'divider') return <hr key={field.id} className="border-border" />;
          if (field.type === 'heading') return <h2 key={field.id} className="text-xl font-semibold pt-2">{field.label}</h2>;
          if (field.type === 'paragraph') return (
            <div key={field.id} className="text-sm leading-relaxed" dangerouslySetInnerHTML={{ __html: field.content || '' }} />
          );
          return (
            <div key={field.id} className="space-y-1.5">
              <label className="text-sm font-medium flex items-center gap-1.5">
                {field.label}
                {field.required && <span className="text-destructive text-xs">*</span>}
              </label>
              {field.type === 'textarea' && (
                <textarea value={answers[field.id] || ''} onChange={e => setAnswers(a => ({ ...a, [field.id]: e.target.value }))}
                  placeholder={field.placeholder} className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm resize-none h-24 outline-none focus:border-primary/50" />
              )}
              {(field.type === 'text' || field.type === 'number' || field.type === 'date') && (
                <input type={field.type} value={answers[field.id] || ''} onChange={e => setAnswers(a => ({ ...a, [field.id]: e.target.value }))}
                  placeholder={field.placeholder} className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm outline-none focus:border-primary/50" />
              )}
              {field.type === 'dropdown' && (
                <select value={answers[field.id] || ''} onChange={e => setAnswers(a => ({ ...a, [field.id]: e.target.value }))}
                  className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm outline-none focus:border-primary/50">
                  <option value="">Select...</option>
                  {(field.options || []).map(opt => <option key={opt} value={opt}>{opt}</option>)}
                </select>
              )}
              {field.type === 'checkbox' && (
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={answers[field.id] || false} onChange={e => setAnswers(a => ({ ...a, [field.id]: e.target.checked }))} className="w-4 h-4" />
                  <span className="text-sm text-muted-foreground">Check to confirm</span>
                </label>
              )}
              {field.type === 'signature' && (
                <div className="h-20 bg-secondary border border-dashed border-border rounded-lg flex items-center justify-center text-xs text-muted-foreground">
                  Signature field
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Drop Indicator ─────────────────────────────────────────────────────────
function DropIndicator() {
  return (
    <div className="relative h-0.5 my-1 mx-1">
      <div className="absolute inset-0 rounded-full bg-primary shadow-[0_0_6px_2px_hsl(var(--primary)/0.4)]" />
      <div className="absolute -left-1 -top-1.5 w-3 h-3 rounded-full border-2 border-primary bg-background" />
    </div>
  );
}

// ─── Main Editor ────────────────────────────────────────────────────────────
export default function WorksheetEditor({ worksheet, onSave, onAssign }) {
  const [title, setTitle] = useState(worksheet?.title || '');
  const [description, setDescription] = useState(worksheet?.description || '');
  const [fields, setFields] = useState(worksheet?.fields || []);
  const [preview, setPreview] = useState(false);
  const [saving, setSaving] = useState(false);
  const [autoSaveStatus, setAutoSaveStatus] = useState('idle'); // 'idle' | 'saving' | 'saved'
  const [isDirty, setIsDirty] = useState(false);
  const [isDraggingFromPalette, setIsDraggingFromPalette] = useState(false);
  const autoSaveTimer = useRef(null);
  const isFirstRender = useRef(true);

  // Mark dirty and schedule autosave on any content change
  useEffect(() => {
    if (isFirstRender.current) { isFirstRender.current = false; return; }
    setIsDirty(true);
    setAutoSaveStatus('idle');
    clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(async () => {
      setAutoSaveStatus('saving');
      await onSave({
        title, description, fields,
        status: worksheet?.status || 'draft',
        folder: worksheet?.folder || 'Worksheet Templates',
        category: worksheet?.category || 'general',
      });
      setAutoSaveStatus('saved');
      setIsDirty(false);
      setTimeout(() => setAutoSaveStatus('idle'), 2000);
    }, 1500);
    return () => clearTimeout(autoSaveTimer.current);
  }, [title, description, fields]);

  // Warn before navigating away with unsaved changes
  useEffect(() => {
    const handler = (e) => {
      if (isDirty) { e.preventDefault(); e.returnValue = ''; }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isDirty]);

  const makeField = (type) => ({
    id: genId(), label: '', type,
    placeholder: '',
    options: type === 'dropdown' ? ['Option 1', 'Option 2'] : [],
    required: false,
    content: '',
  });

  const addField = (type) => setFields(f => [...f, makeField(type)]);

  const updateField = (id, changes) => setFields(f => f.map(field => field.id === id ? { ...field, ...changes } : field));
  const removeField = (id) => setFields(f => f.filter(field => field.id !== id));

  const onDragStart = (start) => {
    if (start.source.droppableId === 'palette') setIsDraggingFromPalette(true);
  };

  const onDragEnd = (result) => {
    setIsDraggingFromPalette(false);
    const { source, destination, draggableId } = result;
    if (!destination) return;

    // Reorder within worksheet
    if (source.droppableId === 'worksheet-fields' && destination.droppableId === 'worksheet-fields') {
      const reordered = Array.from(fields);
      const [moved] = reordered.splice(source.index, 1);
      reordered.splice(destination.index, 0, moved);
      setFields(reordered);
      return;
    }

    // Drop from palette into worksheet
    if (source.droppableId === 'palette' && destination.droppableId === 'worksheet-fields') {
      const type = draggableId.replace('palette-', '');
      const newField = makeField(type);
      const updated = Array.from(fields);
      updated.splice(destination.index, 0, newField);
      setFields(updated);
    }
  };

  const handleSave = async (publish = false) => {
    clearTimeout(autoSaveTimer.current); // cancel pending autosave
    setSaving(true);
    setAutoSaveStatus('saving');
    await onSave({
      title, description, fields,
      status: publish ? 'published' : (worksheet?.status || 'draft'),
      folder: worksheet?.folder || 'Worksheet Templates',
      category: worksheet?.category || 'general',
    });
    setSaving(false);
    setAutoSaveStatus('saved');
    setIsDirty(false);
    setTimeout(() => setAutoSaveStatus('idle'), 2000);
  };

  if (preview) {
    return <WorksheetPreview title={title} description={description} fields={fields} onBack={() => setPreview(false)} />;
  }

  return (
    <DragDropContext onDragStart={onDragStart} onDragEnd={onDragEnd}>
      <div className="flex flex-col h-full">
        {/* Top action bar */}
        <div className="flex items-center justify-between px-5 py-2.5 border-b border-border gap-3 flex-wrap shrink-0 bg-card">
          <input
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="Worksheet title..."
            className="text-sm font-semibold bg-transparent outline-none border-b border-transparent focus:border-primary/50 transition-colors flex-1 min-w-0 py-0.5"
          />
          <div className="flex items-center gap-2 shrink-0">
            {/* Autosave indicator */}
            {autoSaveStatus === 'saving' && (
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <Loader2 className="w-3 h-3 animate-spin" /> Saving…
              </span>
            )}
            {autoSaveStatus === 'saved' && (
              <span className="flex items-center gap-1 text-xs text-emerald-400">
                <Check className="w-3 h-3" /> Saved
              </span>
            )}
            {autoSaveStatus === 'idle' && isDirty && (
              <span className="text-xs text-amber-400">Unsaved</span>
            )}
            <span className={`text-xs border rounded px-2 py-0.5 ${
              worksheet?.status === 'published' ? 'border-green-500/40 text-green-400' : 'border-border text-muted-foreground'
            }`}>
              {worksheet?.status || 'draft'}
            </span>
            <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={() => setPreview(true)}>
              <Eye className="w-3 h-3" /> Preview
            </Button>
            <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={onAssign}>
              <UserPlus className="w-3 h-3" /> Assign
            </Button>
            <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={() => handleSave(false)} disabled={saving}>
              {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
              Save Draft
            </Button>
            <Button size="sm" className="h-7 text-xs bg-primary text-primary-foreground hover:bg-primary/90" onClick={() => handleSave(true)} disabled={saving || !title.trim()}>
              Publish
            </Button>
          </div>
        </div>

        {/* Rich text toolbar */}
        <RichToolbar />

        {/* Doc body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-2 bg-background/50">
          {/* Description */}
          <div className="rounded-lg border border-transparent hover:border-border px-4 py-3 transition-colors mb-2">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1.5">Worksheet Description</p>
            <RichTextBlock
              value={description}
              onChange={setDescription}
              placeholder="Add an introduction or instructions for this worksheet..."
              minHeight={50}
            />
          </div>

          {/* Canvas droppable */}
          <Droppable droppableId="worksheet-fields">
            {(provided, snapshot) => (
              <div
                ref={provided.innerRef}
                {...provided.droppableProps}
                className={`space-y-0 rounded-xl transition-all duration-150 ${
                  snapshot.isDraggingOver
                    ? 'bg-primary/5 ring-2 ring-primary/30 ring-dashed p-2'
                    : isDraggingFromPalette
                    ? 'ring-2 ring-border ring-dashed rounded-xl p-2'
                    : 'p-0'
                }`}
                style={{ minHeight: fields.length === 0 ? 120 : undefined }}
              >
                {fields.length === 0 && !snapshot.isDraggingOver && (
                  <div className={`text-center py-10 text-muted-foreground text-sm border-2 border-dashed rounded-xl transition-colors ${
                    isDraggingFromPalette ? 'border-primary/50 text-primary/70 bg-primary/5' : 'border-border'
                  }`}>
                    {isDraggingFromPalette ? '↓ Drop here to add to worksheet' : 'Drag elements from the panel below, or click to insert'}
                  </div>
                )}

                {fields.map((field, idx) => (
                  <Draggable key={field.id} draggableId={field.id} index={idx}>
                    {(provided, snapshot) => (
                      <>
                        <div
                          ref={provided.innerRef}
                          {...provided.draggableProps}
                          style={provided.draggableProps.style}
                          className={`transition-opacity ${snapshot.isDragging ? 'opacity-70 shadow-2xl' : 'opacity-100'} mb-2`}
                        >
                          <FieldEditor
                            field={field}
                            idx={idx}
                            onChange={changes => updateField(field.id, changes)}
                            onRemove={() => removeField(field.id)}
                            provided={provided}
                          />
                        </div>
                      </>
                    )}
                  </Draggable>
                ))}
                {provided.placeholder}
              </div>
            )}
          </Droppable>
        </div>

        {/* Bottom palette — each item is draggable */}
        <Droppable droppableId="palette" direction="horizontal" isDropDisabled>
          {(provided, snapshot) => (
            <div
              ref={provided.innerRef}
              {...provided.droppableProps}
              className="border-t border-border bg-card px-4 py-2.5 flex items-center gap-1.5 flex-wrap shrink-0"
            >
              <span className="text-[10px] text-muted-foreground uppercase tracking-wider mr-1 shrink-0">
                Drag or click to insert:
              </span>
              {FIELD_TYPES.map((ft, idx) => {
                const Icon = ft.icon;
                return (
                  <Draggable key={ft.value} draggableId={`palette-${ft.value}`} index={idx}>
                    {(provided, snapshot) => (
                      <>
                        {/* Actual draggable chip */}
                        <div
                          ref={provided.innerRef}
                          {...provided.draggableProps}
                          {...provided.dragHandleProps}
                          style={provided.draggableProps.style}
                          onClick={() => addField(ft.value)}
                          title={`Drag or click to add ${ft.label}`}
                          className={`flex items-center gap-1 px-2.5 py-1 text-[10px] font-medium rounded border cursor-grab active:cursor-grabbing select-none transition-all ${
                            snapshot.isDragging
                              ? 'border-primary bg-primary text-primary-foreground shadow-xl scale-105 z-50'
                              : 'border-border bg-background hover:bg-secondary hover:border-primary/40 text-muted-foreground hover:text-foreground'
                          }`}
                        >
                          <Icon className="w-3 h-3" />
                          {ft.label}
                        </div>
                        {/* Clone stays in palette while dragging */}
                        {snapshot.isDragging && (
                          <div className="flex items-center gap-1 px-2.5 py-1 text-[10px] font-medium rounded border border-border bg-background text-muted-foreground opacity-40">
                            <Icon className="w-3 h-3" />
                            {ft.label}
                          </div>
                        )}
                      </>
                    )}
                  </Draggable>
                );
              })}
              {provided.placeholder}
            </div>
          )}
        </Droppable>
      </div>
    </DragDropContext>
  );
}