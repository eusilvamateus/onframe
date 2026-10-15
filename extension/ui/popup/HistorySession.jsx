import { useEffect, useState } from 'react';
import { Alert, Button, Card, Ph, Skeleton } from '@onblide/ui';
import { ItemEditEventCard } from '../shared/ItemEditEvent';
import { sendRemoteMessage, userError } from '../shared/runtime';
import { PopupSessionHeader } from './PopupSessionHeader';

const PAGE_SIZE = 5;

function LoadingHistory() {
  return <div className="onframe-popup-loading-list" aria-label="Carregando histórico">
    {[0, 1, 2].map((item) => <div className="onframe-popup-loading-row" key={item}><Skeleton width={44} height={44} radius={6} /><div><Skeleton width={220} height={13} /><Skeleton width={150} height={10} /></div></div>)}
  </div>;
}

export function HistorySession({ connection, onBack, onOpenFullHistory, footer, header }) {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [nextCursor, setNextCursor] = useState(null);
  const [feedback, setFeedback] = useState('');

  useEffect(() => {
    let active = true;
    setLoading(true);
    void sendRemoteMessage('item-edit-history', { query: { limit: PAGE_SIZE } })
      .then((result) => {
        if (!active) return;
        setEvents(result.events || []);
        setNextCursor(result.nextCursor || null);
      })
      .catch((error) => { if (active) setFeedback(userError(error, 'Não foi possível carregar o histórico.')); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  async function loadMore() {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    setFeedback('');
    try {
      const result = await sendRemoteMessage('item-edit-history', { query: { limit: PAGE_SIZE, cursor: nextCursor } });
      setEvents((current) => [...current, ...(result.events || [])]);
      setNextCursor(result.nextCursor || null);
    } catch (error) {
      setFeedback(userError(error, 'Não foi possível carregar mais alterações.'));
    } finally {
      setLoadingMore(false);
    }
  }

  return (
    <main className="onframe-popup onframe-popup-session">
      {header}
      <PopupSessionHeader title="Histórico" subtitle={connection.workspace.name} onBack={onBack} />
      <div className="onframe-popup-session-body">
        {feedback && <Alert tone="danger" dismissible onClose={() => setFeedback('')}>{feedback}</Alert>}
        <section className="onframe-popup-section" aria-labelledby="history-recent-title">
          <div className="onframe-popup-section-header">
            <div><h2 id="history-recent-title">Alterações recentes</h2><p>{events.length ? `${events.length} ${events.length === 1 ? 'alteração mais recente' : 'alterações mais recentes'}` : 'Atividade realizada pela extensão'}</p></div>
            <Button kind="quiet" tone="primary" size="sm" onClick={onOpenFullHistory} icon={<Ph n="arrow-square-out" size={16} />}>Ver tudo</Button>
          </div>
          {loading ? <LoadingHistory /> : events.length === 0 ? <Card padding={16}>
            <div className="onframe-popup-empty-state">
              <span className="onframe-popup-icon-tile onframe-popup-icon-tile--green"><Ph n="clock-counter-clockwise" size={18} /></span>
              <div><h3>Nenhuma alteração registrada</h3><p>As próximas edições confirmadas aparecerão aqui.</p></div>
            </div>
          </Card> : <div className="onframe-popup-history-list">
            {events.map((event) => <ItemEditEventCard key={event.id} event={event} compact />)}
            {nextCursor && <div className="onframe-popup-history-more">
              <Button kind="quiet" tone="primary" size="sm" disabled={loadingMore} onClick={() => void loadMore()} icon={<Ph n="caret-down" size={16} />}>
                {loadingMore ? 'Carregando...' : 'Carregar mais'}
              </Button>
            </div>}
          </div>}
        </section>
      </div>
      {footer}
    </main>
  );
}
