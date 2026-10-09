"use client";

import { ChevronDown } from "lucide-react";
import { useState, type ReactNode } from "react";

type SettingsSection = {
  id: string;
  eyebrow: string;
  title: string;
  description: string;
  content: ReactNode;
};

export function AdminSettingsAccordion({ sections }: { sections: SettingsSection[] }) {
  const [openSection, setOpenSection] = useState<string | null>(null);

  return (
    <div className="admin-settings-accordion">
      {sections.map(({ id, eyebrow, title, description, content }) => {
        const isOpen = openSection === id;
        const panelId = `admin-settings-panel-${id}`;

        return (
          <section className={`admin-section-card settings-callout admin-settings-item ${isOpen ? "is-open" : ""}`} key={id}>
            <h2 className="admin-settings-heading">
              <button
                aria-controls={panelId}
                aria-expanded={isOpen}
                className="admin-settings-trigger"
                onClick={() => setOpenSection((current) => current === id ? null : id)}
                type="button"
              >
                <span className="admin-settings-copy">
                  <span className="eyebrow">{eyebrow}</span>
                  <span className="admin-settings-title">{title}</span>
                  <span className="admin-settings-description">{description}</span>
                </span>
                <ChevronDown aria-hidden="true" className="admin-settings-chevron" size={20} />
              </button>
            </h2>
            <div className="admin-settings-panel" hidden={!isOpen} id={panelId}>
              {content}
            </div>
          </section>
        );
      })}
    </div>
  );
}
