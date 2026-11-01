#!/usr/bin/env python3
"""Generate human-readable educator review sheets from current JSON.
Content is never approved by this script.
"""
import json
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
b=json.loads((ROOT/'src/data/seed-content.json').read_text(encoding='utf8'))
DOC=ROOT/'docs';DOC.mkdir(exist_ok=True)


def answers(q):
    ss=[f"  - {'**' if i==q['correctIndex'] else ''}{chr(65+i)}. {z}{'**' if i==q['correctIndex'] else ''}"
        for i,z in enumerate(q['choices'])]
    ss+= [f"  - **정답**: {chr(65+q['correctIndex'])}",f"  - **해설**: {q['explanationKo']}"]
    if q.get('evidenceQuote'):ss.append(f"  - **근거**: `{q['evidenceQuote']}`")
    return '\n'.join(ss)

by_word={z['id']:z for z in b['vocabulary']}

lines=['# English Quest — 300개 어휘 카드 (교사 검수용 초안)','','원본 JSON이 유일한 배포 기준입니다. 이 문서는 교사용 검수 자료이며 **정식 승인 콘텐츠가 아닙니다.**','']
for w in b['weekPlans']:
    week=w['week'];lines+=[f"## {week}주차 — {w['titleKo']}",'']
    items=sorted([x for x in b['vocabulary'] if x['week']==week],key=lambda x:(x['day'],x['dailyOrder']))
    for x in items:
        lines+=[f"### Day {x['day']} · {x['headword']} ({x['partOfSpeech']}, {x['level']})", '',
                f"- 뜻: **{x['koreanMeaning']}**", f"- 영어 뜻: {x['englishDefinition']}",
                f"- 예문: {x['exampleEn']}",f"- 번역: {x['exampleKo']}",
                f"- 연어: {', '.join(x['collocations'])}",
                f"- 객관식 오답: {', '.join(x['distractors'])}",
                '- 상태: draft (미검수)', '']
(DOC/'VOCABULARY_300_REVIEW.md').write_text('\n'.join(lines),encoding='utf8')

lines=['# English Quest — 구문 60개 (교사 검수용 초안)', '', '보기 가운데 굵게 표시된 항목이 정답입니다.', '']
for w in b['weekPlans']:
    week=w['week'];lines.extend([f"## {week}주차 — {w['titleKo']}",''])
    items=sorted([x for x in b['syntax'] if x['week']==week],key=lambda x:x['day'])
    for x in items:
        lines+=[f"### Day {x['day']} · {x['id']}",'',f"> {x['sentenceEn']}",'',
            f"**{x['promptKo']}**",'',answers(x),'']
(DOC/'SYNTAX_60_REVIEW.md').write_text('\n'.join(lines),encoding='utf8')

lines=['# English Quest — 독해 지문 60개·문항 120개 (교사 검수용 초안)', '',
       '자동 검사는 지문과 근거 인용의 문자열 일치만 확인했습니다. 의미적 정답의 유일성은 사람이 검수해야 합니다.','']
for w in b['weekPlans']:
    week=w['week'];lines.extend([f"## {week}주차 — {w['titleKo']}",''])
    items=sorted([x for x in b['readings'] if x['week']==week],key=lambda x:x['day'])
    for x in items:
        lines+=[f"### Day {x['day']} · {x['title']} ({x['wordCount']} words · {x['level']})",'',x['passageEn'],'']
        for i,q in enumerate(x['questions'],1):
            lines+=[f"**문항 {i} — {q['promptKo']}**",'',answers(q),'']
(DOC/'READINGS_60_REVIEW.md').write_text('\n'.join(lines),encoding='utf8')

lines=['# English Quest — 별도 진단평가 30문항 (교사 검수용 초안)', '',
       '학습용 300개 표제어를 그대로 묻지 않는 별도 진단 문항입니다. 수준 추천 참고용이며 공인 등급 예측용이 아닙니다.','']
passages={x['id']:x for x in b['diagnostic']['passages']}
for i,q in enumerate(b['diagnostic']['items'],1):
    lines+=[f"## {i}. {q['id']} · {q['type']} · {q['level']}",'']
    if q.get('exampleEn'):lines+=[f"> {q['exampleEn']}",'']
    if q.get('sentenceEn'):lines+=[f"> {q['sentenceEn']}",'']
    if q.get('passageId'):
        p=passages[q['passageId']]
        lines+=[f"**{p['title']}**",'',p['passageEn'],'']
    lines+=[f"**{q['promptKo']}**",'',answers(q),'']
(DOC/'DIAGNOSTIC_30_REVIEW.md').write_text('\n'.join(lines),encoding='utf8')
print('Wrote 4 human review files in docs/')
