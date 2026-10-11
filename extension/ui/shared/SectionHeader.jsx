import React from 'react';

export function SectionHeader({ eyebrow, title, copy, actions }) {
  return (
    <div className="onframe-row onframe-row-between" style={{ alignItems: 'flex-start' }}>
      <div className="onframe-grow">
        {eyebrow && <p className="onframe-eyebrow">{eyebrow}</p>}
        <h2 className="onframe-card-title">{title}</h2>
        {copy && <p className="onframe-card-copy">{copy}</p>}
      </div>
      {actions && <div className="onframe-actions">{actions}</div>}
    </div>
  );
}
