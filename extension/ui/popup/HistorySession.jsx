import { useEffect, useState } from 'react';
import { Alert, Button, Card, Ph, Skeleton } from '@onblide/ui';
import { ItemEditEventCard } from '../shared/ItemEditEvent';
import { sendRemoteMessage, userError } from '../shared/runtime';
import { PopupSessionHeader } from './PopupSessionHeader';

function LoadingHistory() {
  return <div className="onframe-popup-loading-list" aria-label="Carregando histórico">
    {[0, 1, 2].map((item) => <div className="onframe-popup-loading-row" key={item}><Skeleton width={44} height={44} radius={6} /><div><Skeleton width={220} height={13} /><Skeleton width={150} height={10} /></div></div>)}
  </div>;
}

export function HistorySession({ connection, onBack, onOpenOptions, onOpenFullHistory }) {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState('');

  useEffect(() => {
    let active = true;
    setLoading(true);
    void sendRemoteMessage('item-edit-history', { query: { limit: 20 } })
      .then((result) => { if (active) setEvents(result.events || []); })
      .catch((error) => { if (active) setFeedback(userError(error, 'Não foi possível carregar o histórico.')); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  return (
    <main className="onframe-popup onframe-popup-session">
      <PopupSessionHeader title="Histórico" subtitle={connection.workspace.name} onBack={onBack} onOpenOptions={onOpenOptions} />
      <div className="onframe-popup-session-body">
        {feedback && <Alert tone="danger" dismissible onClose={() => setFeedback('')}>{feedback}</Alert>}
        <section className="onframe-popup-section" aria-labelledby="history-recent-title">
          <div className="onframe-popup-section-header">
            <div><h2 id="history-recent-title">Alterações recentes</h2><p>{events.length ? `${events.length} alterações confirmadas` : 'Atividade realizada pela extensão'}</p></div>
          </div>
          {loading ? <LoadingHistory /> : events.length === 0 ? <Card padding={16}>
            <div className="onframe-popup-empty-state">
              <span className="onframe-popup-icon-tile onframe-popup-icon-tile--green"><Ph n="clock-counter-clockwise" size={18} /></span>
              <div><h3>Nenhuma alteração registrada</h3><p>As próximas edições confirmadas aparecerão aqui.</p></div>
            </div>
          </Card> : <div className="onframe-popup-history-list">
            {events.map((event) => <ItemEditEventCard key={event.id} event={event} compact />)}
          </div>}
        </section>
        <Button kind="secondary" onClick={onOpenFullHistory} icon={<Ph n="arrow-square-out" size={17} />}>Abrir histórico completo</Button>
      </div>
    </main>
  );
}
