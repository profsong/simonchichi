#!/usr/bin/env python3
"""Independent read-only QA of generated English Quest JSON.
Checks machine-verifiable constraints; does NOT declare educational approval.
"""
import json
from collections import Counter
from pathlib import Path
import sys

ROOT=Path(__file__).resolve().parents[1]
P=ROOT/'src/data/seed-content.json'


def check(c):
    errors=[]
    warn=[]
    def need(cond,err):
        if not cond: errors.append(err)
    def uniq(items,field,why):
        vals=[z[field] for z in items]
        need(len(vals)==len(set(vals)),f'duplicate {why}: {[k for k,n in Counter(vals).items() if n>1][:12]}')
    v=c['vocabulary']; vq=c['vocabularyQuestions']; s=c['syntax']; r=c['readings']
    d=c['diagnostic'];days=c['dailyPlans'];weeks=c['weekPlans'];boss=c['bossQuests']
    for name, collection, count in [('vocabulary',v,300),('vocab questions',vq,600),('syntax',s,60),('reading',r,60),('diagnostic',d['items'],30),('diagnostic passages',d['passages'],4),('days',days,60),('weeks',weeks,12),('bosses',boss,12)]:
        need(len(collection)==count,f'{name}: expected {count}, got {len(collection)}')
    ids=[]
    for group in [v,vq,s,r,d['items'],d['passages'],days,weeks,boss]:ids.extend(x['id'] for x in group)
    ids.extend(q['id'] for passage in r for q in passage['questions'])
    need(len(ids)==len(set(ids)),'IDs must be globally unique')
    vid={z['id']:z for z in v};sid={z['id']:z for z in s};rid={z['id']:z for z in r};vqid={z['id']:z for z in vq}
    rqs={q['id']:q for z in r for q in z['questions']}
    rqd={x['id']:x for x in d['passages']}
    need(len({z['headword'] for z in v})==300,'Headwords must be unique')
    need(Counter(z['level'] for z in v)=={'B1':80,'B2':140,'B3':80},'Difficulty mix wrong')
    need(Counter(z['week'] for z in v)=={i:25 for i in range(1,13)},'Vocab/week mix wrong')
    need(Counter(z['week'] for z in s)=={i:5 for i in range(1,13)},'Syntax/week mix wrong')
    need(Counter(z['week'] for z in r)=={i:5 for i in range(1,13)},'Reading/week mix wrong')
    need(Counter((z['week'],z['day']) for z in v)=={(w,day):5 for w in range(1,13) for day in range(1,6)},'5 new words/day missing')
    need(sum(len(x['questions']) for x in r)==120,'Reading question count must be 120')
    all_questions=vq+s+d['items']+[q for z in r for q in z['questions']]
    need(len(all_questions)==810,'Expected 810 unique multiple-choice questions')
    for q in all_questions:
        choices=q.get('choices',[])
        need(len(choices)==4 and len(set(choices))==4, f'bad choices: {q["id"]}')
        need(isinstance(q.get('correctIndex'),int) and 0<=q['correctIndex']<=3, f'bad answer idx: {q["id"]}')
        need(bool(q.get('explanationKo')),f'missing explanation: {q["id"]}')
    for word in v:
        need(len(word['distractors'])==3 and len(set([word['koreanMeaning']]+word['distractors']))==4,
             f'vocab KO distractors: {word["id"]}')
        need(word['reviewStatus']=='draft',f'unreviewed content cannot be approved: {word["id"]}')
        need(word['license']=='original',f'content license unset: {word["id"]}')
        head=word['headword'].lower().replace('-','')
        sentence=word['exampleEn'].lower().replace('-','').replace(' ','')
        if not any(head[:i] in sentence for i in {len(head), max(3,len(head)-1),max(3,len(head)-2)}):
            warn.append(f'{word["id"]}: headword not found (including basic inflections) in example')
    for passage in r:
        need(passage['wordCount']==len(passage['passageEn'].split()),f'word count mismatch {passage["id"]}')
        need(passage['reviewStatus']=='draft',f'passage prematurely approved {passage["id"]}')
        need(len(passage['questions'])==2,f'expected 2 questions per passage: {passage["id"]}')
        for q in passage['questions']:
            need(q.get('evidenceQuote','') in passage['passageEn'] and q.get('evidenceQuote'), f'missing reading evidence: {q["id"]}')
        if passage['week']>=9 and passage['wordCount']<170:
            warn.append(f'W{passage["week"]} passage is short for an advanced learner: {passage["id"]}, {passage["wordCount"]} words')
    for p in d['passages']:
        need(p['wordCount']==len(p['passageEn'].split()),'diagnostic word count mismatch: '+p['id'])
    for q in d['items']:
        if q['type']=='reading':
            need(q['passageId'] in rqd,f'unknown diag passage {q["id"]}')
            if q['passageId'] in rqd:
                need(q['evidenceQuote'] in rqd[q['passageId']]['passageEn'], f'diagnostic evidence missing {q["id"]}')
    for day in days:
        need(len(day['vocabularyIds'])==5 and all(z in vid for z in day['vocabularyIds']), f'bad day vocabulary: {day["id"]}')
        need(day['syntaxId'] in sid and day['readingId'] in rid, f'bad day refs: {day["id"]}')
        for x in day['vocabularyIds']:
            need(vid[x]['week']==day['week'] and vid[x]['day']==day['day'],f'wrong day vocab ref {x}')
        if day['syntaxId'] in sid:need(sid[day['syntaxId']]['week']==day['week'], f'syntax wrong week: {day["id"]}')
        if day['readingId'] in rid:
            passage=rid[day['readingId']]
            need(passage['week']==day['week'], f'reading wrong week: {day["id"]}')
            need({q['id'] for q in passage['questions']}==set(day['readingQuestionIds']), f'bad reading subquestions: {day["id"]}')
    need(len(set(z for day in days for z in day['vocabularyIds']))==300,'not all vocab scheduled exactly once')
    need(len(set(day['syntaxId'] for day in days))==60,'not all syntax scheduled exactly once')
    need(len(set(day['readingId'] for day in days))==60,'not all reading scheduled exactly once')
    for b in boss:
        need(b['week'] in range(1,13),'bad boss week')
        need(len(b['vocabularyIds'])==8 and len(b['syntaxIds'])==2 and len(b['readingQuestionIds'])==2,'bad boss item counts')
        need(all(x in vid and vid[x]['week']==b['week'] for x in b['vocabularyIds']),f'bad boss vocab {b["id"]}')
        need(all(x in sid and sid[x]['week']==b['week'] for x in b['syntaxIds']),f'bad boss syntax {b["id"]}')
        need(b['readingId'] in rid and rid[b['readingId']]['week']==b['week'],f'bad boss reading {b["id"]}')
        need(all(x in rqs for x in b['readingQuestionIds']),f'bad boss reading refs {b["id"]}')
    # Inspection note: semantic near-synonyms, lexical complexity, and naturalness cannot be proved automatically.
    return errors,warn


def main():
    c=json.loads(P.read_text(encoding='utf8'))
    errors,warn=check(c)
    print(f'English Quest content QA: {len(errors)} structural errors, {len(warn)} advisories')
    print('Counts: vocabulary=%d, vocabMCQ=%d, syntax=%d, readings=%d, readingMCQ=%d, diagnostic=%d, days=%d, bosses=%d'%(
        len(c['vocabulary']),len(c['vocabularyQuestions']),len(c['syntax']),len(c['readings']),
        sum(len(r['questions']) for r in c['readings']),len(c['diagnostic']['items']),len(c['dailyPlans']),len(c['bossQuests'])))
    if warn:
        print('Advisories:')
        for line in warn[:20]:print(' !',line)
    if errors:
        for line in errors:print('ERROR',line)
        sys.exit(1)
    print('PASS: machine-verifiable structure and references. HUMAN CONTENT REVIEW STILL REQUIRED.')


if __name__=='__main__':main()
