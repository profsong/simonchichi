import { useState, type ChangeEvent } from 'react';
import { version as appVersion } from '../../../package.json';
import type { AppMode, Settings } from '../../core/types';
import type { QuestDatabase } from '../../data/db';
import { exportBackup, importBackup, resetDatabase } from '../../data/db';
import { contentVersion } from '../../data/catalog';
import { Icon } from '../../components/Icon';
import { WordbookSelector } from '../../components/WordbookSelector';
import { Mascot, type AvatarId } from '../../components/Mascot';
import { resolveAvatar } from '../../core/avatar';
import { localDay } from '../../core/scheduler';
import { saveNativeBackup } from '../../platform/runtime';

const companions: { id: AvatarId; name: string; note: string }[] = [
  { id: 'monchichi', name: '몬치치', note: '검은 후드의 단짝 친구' },
  { id: 'sichiware', name: '시치와레', note: '파란 귀의 다정한 고양이' },
  { id: 'sipompurin', name: '시폼푸린', note: '노란 리본의 포근한 친구' },
];

interface Props {
  db: QuestDatabase;
  mode: AppMode;
  settings: Settings;
  busy: boolean;
  offlineReady: boolean;
  native: boolean;
  onSettings: (settings: Settings) => void;
  run: (action: () => Promise<void>) => Promise<void>;
}
export function SettingsScreen({
  db,
  mode,
  settings,
  busy,
  offlineReady,
  native,
  onSettings,
  run,
}: Props) {
  const [message, setMessage] = useState('');
  const [resetting, setResetting] = useState(false);
  const [confirmation, setConfirmation] = useState('');
  const [pendingImport, setPendingImport] = useState<string>();
  const avatar = resolveAvatar(settings.avatarId);
  async function download() {
    await run(async () => {
      const json = await exportBackup(db, contentVersion);
      const filename = `시몬치치-${mode}-${localDay()}.json`;
      if (native) {
        const result = await saveNativeBackup(filename, json);
        setMessage(
          result.cancelled
            ? '저장을 취소했어요. 학습 기록은 그대로 있어요.'
            : '선택한 위치에 백업 파일을 저장했어요.',
        );
        return;
      }
      const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
      setMessage('백업 파일을 만들었어요. 파일 앱의 다운로드 폴더를 확인해 주세요.');
    });
  }
  async function selectBackup(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (file.size > 20 * 1024 * 1024) {
      setMessage('20MB 이하의 시몬치치 백업 파일을 선택해 주세요.');
      return;
    }
    await run(async () => {
      setPendingImport(await file.text());
      setMessage('');
    });
  }
  return (
    <section className="settings-screen">
      <div className="section-top">
        <div>
          <span className="eyebrow">MY LITTLE WORLD</span>
          <h1>나만의 퀘스트</h1>
          <p>함께할 친구와 편안한 학습 환경을 골라요.</p>
        </div>
        <span className="section-emblem">
          <Icon name="settings" size={30} />
        </span>
      </div>
      <WordbookSelector
        value={settings.selectedWordbookId ?? 'advanced-300'}
        disabled={busy}
        onChange={(id) => onSettings({ ...settings, selectedWordbookId: id })}
      />
      <div className="settings-grid">
        <div className="offline-card">
          <Icon name="shield" size={20} />
          <span>
            {native
              ? '앱에 모든 학습 자료가 저장돼요'
              : offlineReady
                ? '오프라인 준비 완료'
                : '학습 기록은 이 기기에 저장돼요'}
          </span>
        </div>
        <section className="panel companion-panel">
          <div className="profile-mascot" data-testid="selected-avatar" data-avatar-id={avatar}>
            <span className="profile-orbit orbit-one" aria-hidden="true" />
            <span className="profile-orbit orbit-two" aria-hidden="true" />
            <Mascot variant={avatar} wardrobe={settings.room} mood="happy" size={160} />
          </div>
          <h2>우리 같이 탐험할까?</h2>
          <p>매일 조금씩, 네 곁에서 응원할게.</p>
          <fieldset className="avatar-picker" disabled={busy}>
            <legend>탐험 친구 선택</legend>
            {companions.map((companion) => (
              <label
                className={`avatar-option ${avatar === companion.id ? 'selected' : ''}`}
                key={companion.id}
              >
                <input
                  type="radio"
                  name="companion"
                  aria-label={companion.name}
                  checked={avatar === companion.id}
                  onChange={() => onSettings({ ...settings, avatarId: companion.id })}
                />
                <Mascot variant={companion.id} wardrobe={settings.room} size={77} />
                <strong>{companion.name}</strong>
                <span>{companion.note}</span>
                {avatar === companion.id && (
                  <span className="avatar-check">
                    <Icon name="check" size={12} />
                  </span>
                )}
              </label>
            ))}
          </fieldset>
        </section>
        <section className="panel">
          <h2>학습 환경</h2>
          <label className="setting-row">
            <span>
              <strong>영어 발음 듣기</strong>
              <small>기기에서 제공하는 영어 음성이 있을 때 사용해요.</small>
            </span>
            <input
              type="checkbox"
              checked={settings.sound}
              onChange={(e) => onSettings({ ...settings, sound: e.target.checked })}
              disabled={busy}
            />
          </label>
          <label className="setting-row">
            <span>
              <strong>화면 테마</strong>
              <small>편한 색을 골라요.</small>
            </span>
            <select
              aria-label="화면 테마"
              value={settings.theme}
              onChange={(e) =>
                onSettings({ ...settings, theme: e.target.value as Settings['theme'] })
              }
              disabled={busy}
            >
              <option value="forest">블루 & 그린</option>
              <option value="night">별빛 모드</option>
            </select>
          </label>
        </section>
        <section className="panel">
          <h2>내 기록 지키기</h2>
          <p className="muted">
            기록은 이 기기에만 있어요. {native ? '앱 삭제나' : '브라우저 데이터 삭제나'} 기기 변경
            전에 백업해 주세요.
          </p>
          <div className="backup-actions">
            <button className="secondary" onClick={() => void download()} disabled={busy}>
              {native ? '백업 파일 저장' : '백업 다운로드'}
            </button>
            <label className="file-button">
              백업 파일 선택
              <input
                type="file"
                accept="application/json,.json"
                onChange={(e) => void selectBackup(e)}
                disabled={busy}
              />
            </label>
          </div>
          {pendingImport && (
            <div className="confirmation">
              <p>
                백업으로 현재 {mode === 'demo' ? '데모' : '학습'} 기록을 교체할까요? 현재 기록을
                먼저 백업해 두세요.
              </p>
              <div className="button-row">
                <button
                  className="primary"
                  disabled={busy}
                  onClick={() =>
                    void run(async () => {
                      await importBackup(db, pendingImport, contentVersion);
                      setPendingImport(undefined);
                      setMessage('학습 기록을 복원했어요.');
                    })
                  }
                >
                  백업으로 복원
                </button>
                <button
                  className="secondary"
                  onClick={() => setPendingImport(undefined)}
                  disabled={busy}
                >
                  취소
                </button>
              </div>
            </div>
          )}
          <p className="muted small">이 앱에서 저장한 호환되는 백업 파일로 복원해요.</p>
          {message && (
            <p className="status-note" role="status">
              {message}
            </p>
          )}
        </section>
        <section className="panel">
          <h2>{native ? '인터넷 없이 함께해요' : 'iPhone에 담아 두기'}</h2>
          <ol className="install-steps">
            <li>
              <span>1</span>
              {native
                ? '학습 자료가 앱에 포함되어 있어요.'
                : 'HTTPS로 배포한 주소를 Safari에서 열어요.'}
            </li>
            <li>
              <span>2</span>
              {native
                ? '비행기 모드에서도 퀘스트를 이어갈 수 있어요.'
                : '공유 메뉴에서 ‘홈 화면에 추가’를 선택해요.'}
            </li>
            <li>
              <span>3</span>
              {native
                ? '백업 파일로 소중한 기록을 보관해 주세요.'
                : '‘오프라인 준비 완료’를 확인한 뒤 사용해요.'}
            </li>
          </ol>
          <p className="muted small">
            {native
              ? '앱을 설치한 뒤에는 첫 실행부터 인터넷 없이 사용할 수 있어요. 앱을 삭제하기 전에 학습 기록을 백업해 주세요.'
              : '첫 실행에는 인터넷이 필요해요. 설치 후에는 비행기 모드에서도 연습할 수 있는지 확인해 주세요.'}
          </p>
        </section>
        <section className="panel privacy-panel">
          <Icon name="shield" size={30} />
          <h2>나만의 작은 학습 공간</h2>
          <p>로그인, 광고, 추적 없이 사용해요. 이름이나 학교를 입력할 필요도 없어요.</p>
          <p className="muted small">
            학습 결과는 연습 기록이며 공인 영어 등급이나 수능 성적을 예측하지 않아요.
          </p>
        </section>

        <section className="panel">
          <h2>기록 초기화</h2>
          <p className="muted">현재 앱의 학습 기록을 삭제해요. 삭제 전 백업을 권장해요.</p>
          {!resetting ? (
            <button
              className="text-button danger"
              disabled={busy}
              onClick={() => setResetting(true)}
            >
              학습 기록 초기화
            </button>
          ) : (
            <div className="confirmation">
              <label>
                ‘초기화’를 입력해 주세요
                <input
                  className="recall-input"
                  aria-label="초기화 확인"
                  placeholder="초기화"
                  value={confirmation}
                  onChange={(e) => setConfirmation(e.target.value)}
                />
              </label>
              <div className="button-row">
                <button
                  className="danger-button"
                  disabled={busy || confirmation !== '초기화'}
                  onClick={() =>
                    void run(async () => {
                      await resetDatabase(db);
                      setResetting(false);
                      setConfirmation('');
                      setMessage('학습 기록을 초기화했어요.');
                    })
                  }
                >
                  영구 삭제
                </button>
                <button className="secondary" onClick={() => setResetting(false)}>
                  취소
                </button>
              </div>
            </div>
          )}
        </section>
      </div>
      <p className="version">
        시몬치치 {appVersion}
        {native ? ' · Android 앱' : ''}
      </p>
    </section>
  );
}
