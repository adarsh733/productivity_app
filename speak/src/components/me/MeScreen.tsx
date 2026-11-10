import { useMe } from '../../features/me/useMe';
import LearnedFromYou from './LearnedFromYou';
import BackupRow from './BackupRow';

export default function MeScreen() {
  const me = useMe();

  return (
    <section className="me-screen" aria-label="Me">
      <header className="me-head">
        <h1 className="me-title">Me</h1>
      </header>

      <div className="me-stats">
        <div className="me-stat" data-testid="stat-streak">
          <span className="me-stat-num">{me.streak}</span>
          <span className="me-stat-label">day streak</span>
        </div>
        <div className="me-stat" data-testid="stat-today">
          <span className="me-stat-num">{me.cardsToday}</span>
          <span className="me-stat-label">cards today</span>
        </div>
        <div className="me-stat" data-testid="stat-words">
          <span className="me-stat-num">{me.wordsAndPhrases}</span>
          <span className="me-stat-label">words and phrases</span>
        </div>
      </div>

      <BackupRow />

      <LearnedFromYou />
    </section>
  );
}
