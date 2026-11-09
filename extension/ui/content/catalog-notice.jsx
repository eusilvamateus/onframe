import { Card, Ph } from '@onblide/ui';

const containerStyle = {
  display: 'flex',
  alignItems: 'flex-start',
  gap: 'var(--ob-space-8)',
  width: '100%',
  boxSizing: 'border-box',
  color: 'var(--ob-fg)',
  fontFamily: 'var(--ob-font)',
  fontSize: 'var(--ob-fs-12)',
  fontWeight: 'var(--ob-w-regular)',
  lineHeight: 'var(--ob-lh-normal)'
};

const iconStyle = {
  marginTop: 'var(--ob-space-2)',
  color: 'var(--ob-blue)'
};

const copyStyle = {
  minWidth: 0,
  margin: 0
};

const titleStyle = {
  color: 'var(--ob-fg-strong)',
  fontWeight: 'var(--ob-w-semibold)'
};

export function CatalogNotice({ children }) {
  return (
    <Card padding="var(--ob-space-12)" elevation="border" style={{ width: '100%', boxSizing: 'border-box' }}>
      <div role="note" aria-label="Anúncio de catálogo" style={containerStyle}>
        <Ph n="info" size={16} weight="fill" style={iconStyle} />
        <p style={copyStyle}>
          <strong style={titleStyle}>Este é um anúncio de catálogo.</strong> {children}
        </p>
      </div>
    </Card>
  );
}
