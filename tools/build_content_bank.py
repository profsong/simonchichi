#!/usr/bin/env python3
"""Build reproducible, unreviewed English Quest content from hand-authored source records.

This script validates counts, syntax, exact evidence spans, study scheduling, and IDs.
It CANNOT validate pedagogical appropriateness or semantic answer ambiguity.
"""
from __future__ import annotations

from collections import Counter, defaultdict
from copy import deepcopy
from datetime import date
from hashlib import sha256
import json
from pathlib import Path
import random
import re

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / 'content_src'
OUT = ROOT / 'src' / 'data'
DEMO = OUT / 'seed-content.demo-original.json'

WEEKS = [
 ('학습 루틴과 핵심 정보', '기초 진단·능동 회상·문장 핵심', '짧은 글에서 핵심 정보와 근거 찾기'),
 ('다의어와 문맥', '다의어·연어·품사·어조', '동일한 단어의 문맥별 의미 판별'),
 ('문장 구조 해독 I', '주절·관계절·문장 성분', '긴 문장 속 핵심 구조 식별'),
 ('문장 구조 해독 II', '양보·조건·분사·정보의 위계', '조건과 부연 설명 분리'),
 ('원인·결과·환경', '인과·증감·변화·기초 실험', '과학·환경 글에서 원인과 근거 찾기'),
 ('근거와 판단', '추상 명사·논거·대안', '견해 및 근거를 재진술하기'),
 ('글의 논리 I', '주장·반론·양보·논리 연결어', '글의 논증 구조 파악'),
 ('글의 논리 II', '지시어·생략·암시', '텍스트의 숨은 연결과 지시 대상 추론'),
 ('주제·제목·요지', '핵심 문장·요약·추상 개념', '전체 의미를 포괄하는 주제 선택'),
 ('빈칸·문장 연결', '논리적 연결·가정·추론', '빈칸 선택과 논리 흐름의 판단'),
 ('복합 상황의 의사결정', '상충 관계·형평·제약·회복력', '정책·기술 문제에서 근거 통합'),
 ('종합 독해와 재진단', '불확실성·인과·전략·평가', '학습 평가와 다음 단계 계획'),
]


def records(name: str, fields: int) -> list[list[str]]:
    rows = []
    for line_n, line in enumerate((SRC / name).read_text(encoding='utf-8').splitlines(), 1):
        line = line.strip()
        if not line or line.startswith('#'):
            continue
        parts = [x.strip() for x in line.split('|')]
        if len(parts) != fields or any(not part for part in parts):
            raise ValueError(f'{name}:{line_n}: expected {fields} non-empty fields, got {len(parts)}: {parts[:3]}')
        rows.append(parts)
    return rows


def shuffled_options(correct: str, wrong: list[str], key: str) -> tuple[list[str], int]:
    if len(wrong) != 3 or len(set([correct] + wrong)) != 4:
        raise ValueError(f'Ambiguous/duplicate options: {key}: {correct!r}, {wrong!r}')
    options = [correct] + wrong
    seed = int(sha256(key.encode('utf-8')).hexdigest()[:16], 16)
    random.Random(seed).shuffle(options)
    return options, options.index(correct)


def core_meta(t: str, level: str, tags: list[str], seconds: int, w: int|None = None, day: int|None = None):
    out = dict(level=level, tags=tags, estimatedSeconds=seconds,
               license='original', reviewStatus='draft', version=1)
    if w is not None: out['week'] = w
    if day is not None: out['day'] = day
    return out


def gen_distractors(vocab: list[dict]):
    """Plausible POS-matched candidates, not semantic guarantees; manual review required."""
    by_pos = defaultdict(list)
    for w in vocab:
        by_pos[w['partOfSpeech']].append(w)
    synonym_pairs = [
        ['adapt', 'alter', 'transform'], ['achieve','attain'], ['predict','anticipate'],
        ['improve','enhance'], ['determine','decide'], ['assess','evaluate'],
        ['appear','emerge'], ['emphasize','highlight'], ['persuade','convince'],
        ['detect','notice'], ['avoid','prevent'], ['assert','advocate'],
        ['claim','argument'], ['cause','factor'], ['efficient','effective'],
        ['essential','crucial'], ['overall','overarching'], ['infer','deduce'],
        ['explain','clarify','elaborate'], ['accumulate','aggregate'],
        ['contrast','distinguish'], ['signal','indicate'], ['valid','credible','reliable'],
        ['convey','express'], ['decrease','decline','diminish'],
        ['increase','expand','accelerate'], ['sustain','maintain','preserve'],
        ['logical','rational'], ['feasible','viable'], ['temporary','provisional','tentative'],
        ['coherent','consistent'], ['inference','interpretation'],
        ['combine','connect','integrate','unify'], ['evident','apparent'],
        ['plausible','credible'],
    ]
    forbidden = {}
    for group in synonym_pairs:
        for hw in group:
            forbidden.setdefault(hw, set()).update(set(group) - {hw})
    extra_prep = [
        dict(headword='among', koreanMeaning='~사이에', partOfSpeech='preposition'),
        dict(headword='during', koreanMeaning='~동안', partOfSpeech='preposition'),
        dict(headword='beyond', koreanMeaning='~너머에', partOfSpeech='preposition'),
        dict(headword='toward', koreanMeaning='~쪽으로', partOfSpeech='preposition'),
    ]
    extra_conj = [
        dict(headword='although',koreanMeaning='비록 ~이지만',partOfSpeech='conjunction'),
        dict(headword='because',koreanMeaning='~때문에',partOfSpeech='conjunction'),
        dict(headword='until',koreanMeaning='~할 때까지',partOfSpeech='conjunction'),
        dict(headword='if',koreanMeaning='만약 ~라면',partOfSpeech='conjunction'),
    ]
    for row in vocab:
        candidates = [x for x in by_pos[row['partOfSpeech']]
                      if x['headword'] != row['headword']
                      and x['headword'] not in forbidden.get(row['headword'], set())
                      and x['koreanMeaning'] != row['koreanMeaning']]
        # Primarily distractors with similar level and a range of topics.
        candidates.sort(key=lambda x: (
            abs(int(x['level'][-1]) - int(row['level'][-1])),
            abs(x['week'] - row['week']),
            sha256((row['headword'] + ':' + x['headword']).encode('utf8')).hexdigest()))
        # Find options with different exact Korean meanings and varied lexemes.
        seen = {row['koreanMeaning']}
        selected = []
        for x in candidates:
            ko = x['koreanMeaning']
            if ko in seen: continue
            # Reject close Korean orthography that may indicate nearly equivalent options.
            if any(ko.startswith(y[:min(3,len(y))]) or y.startswith(ko[:min(3,len(ko))]) for y in seen if len(y) >= 4 and len(ko) >= 4):
                continue
            selected.append(x)
            seen.add(ko)
            if len(selected) == 3: break
        if len(selected)<3 and row['partOfSpeech']=='preposition':
            for x in extra_prep:
                if x['koreanMeaning'] not in seen:
                    selected.append(x); seen.add(x['koreanMeaning'])
                if len(selected)==3:break
        if len(selected)<3 and row['partOfSpeech']=='conjunction':
            for x in extra_conj:
                if x['koreanMeaning'] not in seen:
                    selected.append(x); seen.add(x['koreanMeaning'])
                if len(selected)==3:break
        if len(selected) != 3: raise ValueError('insufficient distractors for ' + row['headword'])
        row['distractors'] = [x['koreanMeaning'] for x in selected]
        row['_distractorWords'] = [x['headword'] for x in selected]


def main():
    base = json.loads(DEMO.read_text(encoding='utf8'))
    vocabulary = deepcopy(base['vocabulary'])
    all_orig = {w['headword'] for w in vocabulary}

    # The existing 60 seed entries keep their stable IDs.
    old_by_band = {b: [w for w in vocabulary if w['level']==b] for b in ('B1','B2','B3')}
    planned = {
        'B1':[4,4,2,2,0,0,0,0,0,0,0,0],
        'B2':[1,1,3,3,5,5,5,5,5,5,1,0],
        'B3':[0,0,0,0,0,0,0,0,0,0,4,5],
    }
    assert all(sum(planned[b]) == len(old_by_band[b]) for b in planned)
    old_week_map = {}
    for band in planned:
        idx = 0
        for week, size in enumerate(planned[band], 1):
            for row in old_by_band[band][idx:idx+size]:
                old_week_map[row['headword']] = week
            idx += size
    for row in vocabulary:
        row.update(week=old_week_map[row['headword']], sourceGroup='initial60')

    newer = records('new_vocabulary.psv', 10)
    assert len(newer) == 240
    for week, band, hw, pos, ko, definition, eg, eg_ko, collocation, tag in newer:
        if hw in all_orig: raise ValueError(f'duplicate vocab with seed: {hw}')
        all_orig.add(hw)
        w = int(week)
        vocabulary.append(dict(type='vocab', id=f'v-{re.sub("[^a-z0-9]+","-",hw)}-sense1',
            headword=hw, senseId=f'{hw}.1', partOfSpeech=pos,
            koreanMeaning=ko, englishDefinition=definition,
            exampleEn=eg, exampleKo=eg_ko, collocations=[collocation],
            acceptedAnswers=[hw], week=w, sourceGroup='expanded240',
            **core_meta('vocab',band,[tag],30)))
    assert len(vocabulary) == 300 and len({x['headword'] for x in vocabulary}) == 300
    assert Counter(x['level'] for x in vocabulary)=={'B1':80,'B2':140,'B3':80}
    assert Counter(x['week'] for x in vocabulary) == {w:25 for w in range(1,13)}

    gen_distractors(vocabulary)
    # Create stable, balanced daily chunks from 25 entries per week.
    for week in range(1,13):
        group = [w for w in vocabulary if w['week']==week]
        random.Random(1000+week).shuffle(group)
        for i, row in enumerate(group):
            row['day'] = i//5 + 1
            row['dailyOrder'] = i%5 + 1

    vocab_questions=[]
    for row in vocabulary:
        # English -> Korean (recognition)
        opts, idx = shuffled_options(row['koreanMeaning'], row['distractors'], row['id']+'-r')
        vocab_questions.append(dict(
            id=row['id']+'-r', type='vocab_en_to_ko', vocabId=row['id'],
            promptKo=f"영어 단어 ‘{row['headword']}’의 뜻으로 가장 적절한 것은?",
            choices=opts, correctIndex=idx,
            explanationKo=f"{row['headword']} ({row['partOfSpeech']})는 ‘{row['koreanMeaning']}’라는 뜻이다. {row['exampleKo']}",
            exampleEn=row['exampleEn'], **core_meta('vocab_en_to_ko',row['level'],row['tags'],25,row['week'],row['day'])))
        # Korean -> English (recognition with an English-definition disambiguating clue)
        eng_options, idx = shuffled_options(row['headword'], row['_distractorWords'], row['id']+'-p')
        vocab_questions.append(dict(
            id=row['id']+'-p', type='vocab_ko_to_en', vocabId=row['id'],
            promptKo=f"‘{row['koreanMeaning']}’에 가장 가까운 단어는? (영어 정의: {row['englishDefinition']})",
            choices=eng_options, correctIndex=idx,
            explanationKo=f"정답은 {row['headword']}이다. 예문: {row['exampleKo']}",
            exampleEn=row['exampleEn'], **core_meta('vocab_ko_to_en',row['level'],row['tags'],25,row['week'],row['day'])))
        row.pop('_distractorWords')

    syntax = deepcopy(base['syntax'])
    assert len(syntax) == 10
    for i, row in enumerate(syntax):
        row.update(week=3 if i<5 else 4, day=(i%5)+1, sourceGroup='initial10')
    for seq, r in enumerate(records('new_syntax.psv',10), 1):
        w,band,focus,sentence,prompt,correct,*rest = r
        # rest = wrong1,wrong2,wrong3,explanation
        wrong=rest[:3]; explain=rest[3]
        key=f'syn-extra-{seq:03d}'
        opts,ci=shuffled_options(correct,wrong,key)
        syntax.append(dict(type='syntax',id=key,sentenceEn=sentence,promptKo=prompt,choices=opts,
                           correctIndex=ci,explanationKo=explain,focus=focus,
                           sourceGroup='expanded50',
                           **core_meta('syntax',band,[focus],45,int(w))))
    assert len(syntax)==60
    for week in range(1,13):
        subset=[r for r in syntax if r['week']==week]
        assert len(subset)==5,(week,len(subset))
        for d,row in enumerate(subset, 1):row['day']=d

    readings=deepcopy(base['readings'])
    for i, row in enumerate(readings):
        row.update(week=i+1, day=1, sourceGroup='initial6')
    all_extensions=dict(records('reading_extensions.psv',2))
    new_readings = records('new_readings.psv',16)
    assert len(new_readings)==54
    for seq, r in enumerate(new_readings, 1):
        w,level,title,passage,main,wrong1,wrong2,wrong3,main_ev,detail_prompt,detail,wrong4,wrong5,wrong6,detail_ev,tags=r
        if title not in all_extensions: raise ValueError(f'No extension for {title}')
        if main_ev not in passage: raise ValueError(f'Main evidence missing BEFORE extension: {title}')
        # The extension is inserted before a pre-written thesis sentence, not inside its evidence.
        passage = passage.replace(main_ev, all_extensions[title]+' '+main_ev, 1)
        if main_ev not in passage or detail_ev not in passage:
            raise ValueError('Missing evidence after extension '+title)
        key=f'read-extra-{seq:03d}'
        opts1,idx1=shuffled_options(main,[wrong1,wrong2,wrong3],key+'-q1')
        opts2,idx2=shuffled_options(detail,[wrong4,wrong5,wrong6],key+'-q2')
        qs=[dict(id=key+'-q1',type='reading',questionType='main_idea',promptKo='다음 글의 중심 생각으로 가장 적절한 것은?',
                 choices=opts1,correctIndex=idx1,
                 explanationKo=f"글의 논지를 요약하면 ‘{main}’이다. 근거: {main_ev}",evidenceQuote=main_ev),
            dict(id=key+'-q2',type='reading',questionType='detail',promptKo=detail_prompt,
                 choices=opts2,correctIndex=idx2,
                 explanationKo=f"정답은 ‘{detail}’이다. 근거: {detail_ev}",evidenceQuote=detail_ev)]
        readings.append(dict(type='reading',id=key,title=title,passageEn=passage,wordCount=len(passage.split()),
            questions=qs,sourceGroup='expanded54',
            **core_meta('reading',level,[tags],240,int(w))))
    assert len(readings)==60
    assert Counter(r['week'] for r in readings)=={w:5 for w in range(1,13)}
    for week in range(1,13):
        subset=[r for r in readings if r['week']==week]
        for day, row in enumerate(subset,1):row['day']=day

    # Distinct diagnostic bank, not mixed into routine 12-week training items.
    diagnostic_items=[]
    diag_passages=[]
    for i,r in enumerate(records('diagnostic_vocab.psv',9),1):
        band,hw,example,prompt,correct,w1,w2,w3,explain=r
        if hw in all_orig:raise ValueError('diagnostic headword also in training bank: '+hw)
        key=f'diag-v-{i:02d}'
        opts,idx=shuffled_options(correct,[w1,w2,w3],key)
        diagnostic_items.append(dict(id=key,type='vocab',level=band,focus='word_in_context',
               headword=hw,exampleEn=example,promptKo=prompt,choices=opts,correctIndex=idx,
               explanationKo=explain,reviewStatus='draft',license='original',version=1))
    for i,r in enumerate(records('diagnostic_syntax.psv',9),1):
        band,focus,sentence,prompt,correct,w1,w2,w3,explain=r
        key=f'diag-s-{i:02d}'
        opts,idx=shuffled_options(correct,[w1,w2,w3],key)
        diagnostic_items.append(dict(id=key,type='syntax',level=band,focus=focus,sentenceEn=sentence,
               promptKo=prompt,choices=opts,correctIndex=idx,explanationKo=explain,
               reviewStatus='draft',license='original',version=1))
    for i,r in enumerate(records('diagnostic_readings.psv',15),1):
        band,title,passage,main,w1,w2,w3,main_ev,d_prompt,detail,w4,w5,w6,d_ev,tag=r
        key=f'diag-read-{i:02d}'
        diag_passages.append(dict(id=key,title=title,passageEn=passage,wordCount=len(passage.split()),
                                  level=band,reviewStatus='draft',license='original',version=1))
        o1,i1=shuffled_options(main,[w1,w2,w3],key+'-q1')
        o2,i2=shuffled_options(detail,[w4,w5,w6],key+'-q2')
        diagnostic_items.extend([
            dict(id=key+'-q1',type='reading',level=band,focus='main_idea',passageId=key,
                 promptKo='글의 중심 생각으로 가장 적절한 것은?',choices=o1,correctIndex=i1,
                 evidenceQuote=main_ev,explanationKo=f"글의 논지: {main}. 근거: {main_ev}",
                 reviewStatus='draft',license='original',version=1),
            dict(id=key+'-q2',type='reading',level=band,focus='detail',passageId=key,
                 promptKo=d_prompt,choices=o2,correctIndex=i2,
                 evidenceQuote=d_ev,explanationKo=f"정답: {detail}. 근거: {d_ev}",
                 reviewStatus='draft',license='original',version=1)])
    assert len(diagnostic_items)==30

    # 60 daily content bundles; due-vocabulary reviews are scheduled dynamically by SRS.
    daily_plans=[]; week_plans=[]; bosses=[]
    for w in range(1,13):
        voc=sorted([x for x in vocabulary if x['week']==w],key=lambda x:(x['day'],x['dailyOrder']))
        syn=sorted([x for x in syntax if x['week']==w],key=lambda x:x['day'])
        rea=sorted([x for x in readings if x['week']==w],key=lambda x:x['day'])
        assert len(voc)==25 and len(syn)==5 and len(rea)==5
        for d in range(1,6):
            vday=[x for x in voc if x['day']==d]
            assert len(vday)==5
            daily_plans.append(dict(id=f'w{w:02d}-d{d}',week=w,day=d,
                targetMinutes=12,contentReviewTarget=6,phaseDurationsMinutes=dict(review=3,vocab=3,syntax=2,reading=4),
                vocabularyIds=[x['id'] for x in vday],syntaxId=syn[d-1]['id'],readingId=rea[d-1]['id'],
                readingQuestionIds=[q['id'] for q in rea[d-1]['questions']],
                isFixedSchedule=False,allowSrsAdjustment=True))
        theme, focus, goal = WEEKS[w-1]
        week_plans.append(dict(id=f'week-{w:02d}',week=w,titleKo=theme,vocabFocusKo=focus,
                readingGoalKo=goal,weekdays=[1,2,3,4,5],saturday='optional_boss',sunday='optional_rest_or_review',
                vocabularyIds=[x['id'] for x in voc],syntaxIds=[x['id'] for x in syn],readingIds=[x['id'] for x in rea]))
        # Boss uses already-seen, not new, content: 8 vocab, 2 syntax, 1 reading (2 subquestions)
        boss_voc=[voc[i]['id'] for i in [1,3,6,9,12,16,20,24]]
        boss_syn=[syn[1]['id'],syn[4]['id']]
        boss_read=rea[4]
        bosses.append(dict(id=f'boss-{w:02d}',week=w,titleKo=theme+' 보스전',
            isReview=True,availability='after_day5',
            vocabularyIds=boss_voc,syntaxIds=boss_syn,readingId=boss_read['id'],
            readingQuestionIds=[q['id'] for q in boss_read['questions']],
            recommendedMinutes=10,scoring=dict(correctXp=10,firstAttemptOnly=True,
            noStreakPenalty=True,reviewNotNew=True),reviewStatus='draft'))

    content = dict(schemaVersion=1,contentVersion='1.0.0-12week-draft',
        generatedOn='2026-10-23',
        noticeKo='독자적으로 작성된 12주 분량 문제은행 초안. 구조 검사는 통과하더라도 언어 정확성·정답의 단일성·수준·어감 등 사람의 교차 검수 전에는 학생용 정식 모드에 공개하지 마세요.',
        levelScaleKo={'B1':'내부 단계: 중등 심화','B2':'내부 단계: 고등 영어 연결','B3':'내부 단계: 고등 영어 입문·추론 (공인 CEFR 레벨이 아님)'},
        licenseNotice='All instructional passages and example sentences are newly authored for this project; do not imply official EBS/CSAT accreditation.',
        vocabulary=vocabulary,vocabularyQuestions=vocab_questions,syntax=syntax,readings=readings,
        diagnostic=dict(items=diagnostic_items,passages=diag_passages,scoringPolicy='recommend_level_only'),
        weekPlans=week_plans,dailyPlans=daily_plans,bossQuests=bosses)
    validate(content)
    OUT.mkdir(parents=True,exist_ok=True)
    target=OUT/'seed-content.json'
    target.write_text(json.dumps(content,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
    (OUT/'english-quest-question-bank.json').write_text(json.dumps(dict(schemaVersion=1,contentVersion=content['contentVersion'],
       reviewStatus='draft',vocabularyQuestions=vocab_questions,syntax=syntax,readings=readings,
       diagnostic=content['diagnostic']),ensure_ascii=False,indent=2)+'\n',encoding='utf8')
    (OUT/'curriculum-12weeks.json').write_text(json.dumps(dict(schemaVersion=1,
        contentVersion=content['contentVersion'],weekPlans=week_plans,dailyPlans=daily_plans,bossQuests=bosses),
        ensure_ascii=False,indent=2)+'\n',encoding='utf8')
    report_md(content)
    print(f"Created {target}: {len(vocabulary)} words, {len(vocab_questions)} vocabulary MCQs, {len(syntax)} syntax tasks, {len(readings)} passages, "
          f"{sum(len(p['questions']) for p in readings)} reading MCQs, {len(diagnostic_items)} diagnostic questions, "
          f"{len(bosses)} boss sets, {len(daily_plans)} daily plans; all drafts")


def validate(c):
    voc, vq, syn, rd = [c[k] for k in ['vocabulary','vocabularyQuestions','syntax','readings']]
    assert len(voc)==300 and len(vq)==600 and len(syn)==60 and len(rd)==60
    assert len(c['weekPlans'])==12 and len(c['dailyPlans'])==60 and len(c['bossQuests'])==12
    assert Counter(x['week'] for x in voc)=={w:25 for w in range(1,13)}
    assert Counter(x['week'] for x in syn)=={w:5 for w in range(1,13)}
    assert Counter(x['week'] for x in rd)=={w:5 for w in range(1,13)}
    assert sum(len(p['questions']) for p in rd)==120
    assert len(c['diagnostic']['items'])==30
    unique_ids=[]
    for arr in [voc,vq,syn,rd,c['diagnostic']['items'],c['diagnostic']['passages'],c['weekPlans'],c['dailyPlans'],c['bossQuests']]:
        unique_ids.extend(x['id'] for x in arr)
    unique_ids.extend(q['id'] for p in rd for q in p['questions'])
    assert len(unique_ids)==len(set(unique_ids)), [k for k,v in Counter(unique_ids).items() if v>1]
    for w in voc:
        assert len(w['distractors'])==3 and len(set([w['koreanMeaning']]+w['distractors']))==4
        assert w['partOfSpeech'] in {'noun','verb','adjective','adverb','conjunction','preposition'}
        assert w['reviewStatus']=='draft' and w['license']=='original'
        assert w['headword'] and len(w['exampleEn'].split())>=5 and len(w['exampleKo'])>=8
    all_questions=vq+syn+c['diagnostic']['items']+[q for p in rd for q in p['questions']]
    assert len(all_questions)==810
    for q in all_questions:
        assert len(q['choices'])==4 and len(set(q['choices']))==4,q['id']
        assert 0<=q['correctIndex']<=3 and q['explanationKo'],q['id']
        assert q.get('reviewStatus','draft')=='draft'
    for p in rd:
        assert p['wordCount']==len(p['passageEn'].split()) and len(p['questions'])==2
        for q in p['questions']:
            assert q['evidenceQuote'] in p['passageEn'],(p['title'],q['id'])
    pmap={p['id']:p for p in c['diagnostic']['passages']}
    for q in c['diagnostic']['items']:
        if q['type']=='reading':
            assert q['evidenceQuote'] in pmap[q['passageId']]['passageEn']
    for d in c['dailyPlans']:
        assert len(d['vocabularyIds'])==5 and len(d['readingQuestionIds'])==2
    assert len(set(z for d in c['dailyPlans'] for z in d['vocabularyIds']))==300
    assert len(set(d['syntaxId'] for d in c['dailyPlans']))==60
    assert len(set(d['readingId'] for d in c['dailyPlans']))==60
    for b in c['bossQuests']:
        assert len(b['vocabularyIds'])==8 and len(b['syntaxIds'])==2 and len(b['readingQuestionIds'])==2
        assert all(x in unique_ids for x in b['vocabularyIds']+b['syntaxIds']+[b['readingId']]+b['readingQuestionIds'])
    diag_hw={q.get('headword') for q in c['diagnostic']['items'] if q.get('headword')}
    assert not diag_hw.intersection({w['headword'] for w in voc})
    # English multiple-choice options must be exactly 4 distinct headwords, all sourced.
    hws={w['headword'] for w in voc} | {'among','during','beyond','toward','although','because','until','if'}
    for q in vq:
        if q['type']=='vocab_ko_to_en':assert set(q['choices']) <= hws


def report_md(c):
    paths = ROOT / 'docs';paths.mkdir(exist_ok=True)
    lines=['# English Quest — 12주 문제은행 구성·검수 보고서', '',
       '이 문서는 구조적 자동 검수를 통과한 **교육용 초안(draft)** 의 목록입니다. 실제 학생 사용 전 영어 교사·학습자 수준 검수가 필요합니다.', '',
       '## 전체 수량', '',
       '| 항목 | 개수 | 상태 |','|---|---:|---|',
       '| 고유 표제어 | 300 | 미검수 초안 |',
       '| 단어 객관식 (영→한·한→영) | 600 | 미검수 초안 |',
       '| 구문 퀴즈 | 60 | 미검수 초안 |',
       '| 독해 지문 | 60 | 미검수 초안 |',
       '| 독해 객관식 | 120 | 미검수 초안 |',
       '| 별도 사전 진단 문제 | 30 | 미검수 초안 |',
       '| 주간 보스전 구성 | 12 | 이미 배운 문항 재활용 |',
       '| 평일 학습 일정 | 60 | 하루 신규 단어 5개·구문 1개·지문 1개 |', '',
       '총 **810개 고유 객관식 문제**(단어 600+구문 60+독해 120+진단 30)이며, 보스전은 **기존 문항의 재출제**이므로 새로운 고유 문제 수에 더하지 않습니다.', '',
       '## 수준 분포', '',
       '| 내부 수준 | 단어 수 | 의미 |','|---|---:|---|',
       '| B1 | 80 | 중등 심화 |','| B2 | 140 | 고등 연결 |','| B3 | 80 | 고등 입문·추론 |','',
       'B1/B2/B3는 **이 프로젝트 내부 단계**이며 공인 CEFR B1/B2/B3 표준의 명칭이 아닙니다.','',
       '## 12주 구성표','','| 주차 | 주제 | 신규 어휘 | 구문 | 독해 | 독해 문항 |',
       '|---|---|---:|---:|---:|---:|']
    for w in c['weekPlans']:
        number=w['week'];lines.append(f"| {number} | {w['titleKo']} | 25 | 5 | 5 | 10 |")
    lines.extend(['', '## 주차별 단어 목록', ''])
    for week in range(1,13):
        words=sorted([x for x in c['vocabulary'] if x['week']==week],key=lambda x:(x['day'],x['dailyOrder']))
        lines.extend([f'### {week}주차', '', '| 학습일 | 단어 | 의미 | 내부 수준 |', '|---|---|---|---|'])
        for word in words:
            lines.append(f"| {word['day']}일차 | {word['headword']} | {word['koreanMeaning']} | {word['level']} |")
        lines.append('')
    lines.extend(['## 원문·정답 검수 주의사항','',
       '1. 정답 선택지는 자동으로 섞었고, 문자열 중복·누락·정답 인덱스 오류를 검사했습니다. **의미가 유사하여 복수 정답으로 읽힐 가능성은 자동 검증으로 배제할 수 없습니다.**',
       '2. 모든 독해 문항의 `evidenceQuote`가 실제 `passageEn`에 존재하는지 문자열 검사했습니다. 단, 근거가 선택지의 유일한 정답임을 논리적으로 입증하는 사람 검수는 남아 있습니다.',
       '3. 모든 레코드는 `reviewStatus: "draft"`이며, `approved`로 일괄 변경하는 스크립트는 제공하지 않습니다.',
       '4. 단어 예문·구문·지문은 교육용으로 새로 작성한 텍스트이며, 공식 수능/EBS 문제의 복제나 공식 난이도 표기는 아닙니다.',
       '5. 고정된 Day 1~5 일정은 기본 계획입니다. 실제 출시 앱에서는 학습자의 복습 부담·오답률에 따라 신규 출제량을 유연하게 조절해야 합니다.',
       '', '## 교차 검수 순서', '',
       '- 1차: 영어 어법·자연스러움·원어민 표현·한국어 번역을 검토합니다.',
       '- 2차: 각 4지선다 보기 중 정확한 답이 한 개뿐인지 독립적으로 풀어봅니다.',
       '- 3차: 독해 글의 주장, 근거 문장, 해설이 일치하는지 확인합니다.',
       '- 4차: 중2 상위권 대상 실제 학습 시간·이해도를 확인하고 난이도를 조정합니다.',
       '- 통과한 항목만 개별적으로 `approved`로 변경하며 검수자·날짜를 관리합니다.',
       '', '## 자동 생성/검사', '',
       '`python3 tools/build_content_bank.py`는 `content_src`에 있는 텍스트 원본을 읽어 JSON을 재생성하고 구조 테스트를 수행합니다.',
       '`python3 tools/validate_content_bank.py`는 배포할 JSON을 읽어 독립적으로 검증합니다.',
       ''])
    (paths/'CONTENT_COUNTS_AND_WORDLIST.md').write_text('\n'.join(lines),encoding='utf8')


if __name__=='__main__':
    main()
