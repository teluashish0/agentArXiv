"use client";

import { ArrowUp, Command, CornerDownLeft } from "lucide-react";

type PaperSearchPanelProps = {
  formId: string;
  inputId: string;
  draftQuery: string;
  placeholder: string;
  disabled?: boolean;
  onDraftQueryChange: (value: string) => void;
  onSubmit: () => void;
};

export function PaperSearchPanel({
  formId,
  inputId,
  draftQuery,
  placeholder,
  disabled = false,
  onDraftQueryChange,
  onSubmit,
}: PaperSearchPanelProps) {
  return (
    <form
      id={formId}
      className="search-panel"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      <textarea
        id={inputId}
        className="search-input"
        placeholder={placeholder}
        rows={2}
        value={draftQuery}
        disabled={disabled}
        onChange={(event) => {
          onDraftQueryChange(event.target.value);
        }}
        onKeyDown={(event) => {
          if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
            event.preventDefault();
            onSubmit();
          }
        }}
      />

      <div className="search-toolbar">
        <span className="search-hint">
          <Command className="search-hint-icon" absoluteStrokeWidth strokeWidth={2.2} />
          <CornerDownLeft className="search-hint-icon" absoluteStrokeWidth strokeWidth={2.2} />
          <span>To search</span>
        </span>
        <button
          className="search-submit"
          type="submit"
          aria-label="Search papers"
          disabled={disabled}
        >
          <ArrowUp absoluteStrokeWidth strokeWidth={2.4} />
        </button>
      </div>
    </form>
  );
}
