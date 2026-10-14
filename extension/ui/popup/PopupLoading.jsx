import { Skeleton } from '@onblide/ui';

export function PopupLoading() {
  return <main className="onframe-popup onframe-popup-home onframe-popup-home--loading" aria-busy="true" aria-label="Carregando conta">
    <header className="onframe-popup-userbar">
      <div className="onframe-popup-user">
        <Skeleton circle height={40} />
        <div className="onframe-popup-skeleton-copy">
          <Skeleton width={112} height={14} />
          <Skeleton width={164} height={10} />
        </div>
      </div>
      <div className="onframe-popup-actions">
        <Skeleton width={40} height={22} radius={999} />
        <Skeleton width={32} height={32} />
      </div>
    </header>
    <div className="onframe-popup-home-loading-list" aria-hidden="true">
      {[0, 1, 2].map((item) => <div className="onframe-popup-home-loading-row" key={item}>
        <Skeleton width={36} height={36} radius={8} />
        <div className="onframe-popup-skeleton-copy">
          <Skeleton width={104 + (item * 12)} height={12} />
          <Skeleton width={190 + (item * 16)} height={9} />
        </div>
        <Skeleton width={16} height={16} />
      </div>)}
    </div>
    <footer className="onframe-popup-footer" aria-hidden="true">
      <Skeleton width={82} height={32} radius={6} />
      <Skeleton width={104} height={32} radius={6} />
    </footer>
  </main>;
}
