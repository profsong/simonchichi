"""Build the two owner-authorized courses from explicitly authored source records.

No network, random generation, glossary-list passage generation, or runtime authoring.
Existing word identities and source order are preserved. This is an author review,
not a claim of independent teacher review.
"""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
import re
import unicodedata

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'content_src' / 'courses'
TARGET = ROOT / 'src' / 'data' / 'courses'
REPORT = ROOT / 'artifacts' / 'courses' / 'content-validation.json'

GRAMMAR = {
    'concession': ('Although로 시작하는 절은 어떤 관계를 나타내나요?', ['양보·대조', '원인', '조건', '목적'], 'although는 앞의 상황에도 불구하고 뒤의 일이 성립함을 나타냅니다.'),
    'reason': ('Because로 시작하는 절은 어떤 관계를 나타내나요?', ['원인·이유', '양보', '가정', '목적'], 'because절은 뒤에 나오는 행동이나 상황의 이유를 설명합니다.'),
    'condition': ('If로 시작하는 절은 어떤 관계를 나타내나요?', ['조건', '이미 일어난 결과', '목적', '양보'], 'if절은 뒤의 일이 성립하는 조건을 제시합니다.'),
    'relative': ('who 또는 which로 시작하는 절의 역할은 무엇인가요?', ['앞의 명사를 설명한다', '문장 전체를 질문으로 바꾼다', '행동의 목적을 나타낸다', '주절의 시제를 과거로 바꾼다'], '관계절은 앞에 나온 사람이나 사물에 관한 정보를 덧붙입니다.'),
    'purpose': ('문장 앞의 To + 동사원형은 무엇을 나타내나요?', ['행동의 목적', '반대되는 결과', '이미 끝난 사건', '주절의 주어'], '문장 앞의 to부정사구는 뒤에 나오는 행동을 하는 목적을 나타냅니다.'),
    'passive': ('이 문장에서 수동태가 나타내는 내용은 무엇인가요?', ['주어가 동작의 대상이다', '주어가 동작을 직접 수행한다', '주어가 미래를 예측한다', '주어가 명령을 내린다'], 'be동사와 과거분사로 이루어진 수동태에서는 주어가 그 동작을 받는 대상입니다.'),
    'time': ('When으로 시작하는 절은 무엇을 나타내나요?', ['일이 일어나는 때', '반대 의견', '행동의 목적', '명사의 소유 관계'], 'when절은 주절의 일이 일어나는 때를 설명합니다.'),
    'contrast': ('이 문장에서 while은 어떤 관계를 나타내나요?', ['두 상황의 대조', '한 상황의 원인', '미래의 조건', '행동의 목적'], '여기서 while은 서로 다른 두 상황을 나란히 놓아 대조합니다.'),
    'result': ('so that 뒤의 절은 이 문장에서 무엇을 설명하나요?', ['앞의 행동으로 이루려는 목적', '앞의 말과 반대되는 사실', '명사의 소유자', '주절의 주어'], '이 문장의 so that절은 앞의 행동으로 이루려는 목적을 설명합니다.'),
    'not-until': ('not ... until 표현의 뜻으로 가장 알맞은 것은?', ['~하고 나서야 비로소 …하다', '~하자마자 …을 그만두다', '~하지 않아도 항상 …하다', '~하기 위해 미리 …하다'], 'not ... until은 until 뒤의 시점이나 일이 되어야 비로소 주절의 일이 일어남을 나타냅니다.'),
}


def read(path):
    return json.loads(path.read_text(encoding='utf-8'))


def normalize(word):
    return re.sub(r'\s+', ' ', unicodedata.normalize('NFKC', word).translate(str.maketrans('‘’ʼ‐‑', "'''--")).strip()).lower()


def word_id(word):
    value = 14695981039346656037
    raw = normalize(word).encode('utf-16-le')
    for index in range(0, len(raw), 2):
        value = ((value ^ int.from_bytes(raw[index:index + 2], 'little')) * 1099511628211) & ((1 << 64) - 1)
    return f'word-{value:016x}'


def forms(word):
    # Matching annotations only, never answer grading. Retain phrase/hyphen boundaries.
    value = normalize(word)
    result = {value}
    if re.fullmatch('[a-z]+', value) and len(value) >= 4:
        result.update([value + 's', value + 'es', value + 'ed', value + 'ing'])
        if value.endswith('e'):
            result.update([value + 'd', value[:-1] + 'ing'])
        if value.endswith('y'):
            result.update([value[:-1] + 'ies', value[:-1] + 'ied'])
        if len(value) > 2 and value[-1] not in 'aeiouwxy' and value[-2] in 'aeiou':
            result.update([value + value[-1] + 'ed', value + value[-1] + 'ing'])
    return result


def targets(text, words):
    return [word['id'] for word in words if any(re.search(r'(?<![\w-])' + re.escape(form) + r'(?![\w-])', text.lower()) for form in forms(word['headword']))]


def records(filename, width):
    result = {}
    for path in sorted(SOURCE.glob(filename)):
        for line_number, line in enumerate(path.read_text(encoding='utf-8').splitlines(), 1):
            if not line.strip() or line.startswith('#'):
                continue
            row = line.split('|')
            assert len(row) == width, (path.name, line_number, len(row), width)
            key = (row[0], int(row[1]), int(row[2]))
            assert key not in result, ('duplicate source', key)
            result[key] = row[3:]
    return result


def rotate(answer, wrong, offset):
    choices = [answer, *wrong]
    return choices[-offset:] + choices[:-offset] if offset else choices, offset


def build():
    seed = read(ROOT / 'src/data/seed-content.json')
    pdf = read(ROOT / 'src/data/wordbooks/suneung-2000.json')
    canonical = {normalize(word['headword']): word['id'] for word in reversed(seed['vocabulary'])}
    syntax_rows = records('syntax.psv', 5)
    reading_rows = records('readings*.psv', 12)
    reuse = read(SOURCE / 'reading-reuse.json')
    old_readings = {row['id']: row for row in seed['readings']}
    documents = []
    reused = []
    for course_id, title, raw_words, book_ids in [
        ('advanced-300', '중등 심화 300', seed['vocabulary'], ['curriculum-b1', 'curriculum-b2', 'curriculum-b3']),
        ('suneung-2000', '수능 영어 2000', pdf['entries'], ['suneung-2000']),
    ]:
        words = []
        for row in raw_words:
            raw = row['headword']
            study = {'vaccum': 'vacuum', 'lagacy': 'legacy'}.get(raw, raw) if course_id == 'suneung-2000' else raw
            entry = {'id': canonical.get(normalize(raw), word_id(raw)), 'sourceEntryId': row['id'], 'headword': study, 'sourceHeadword': raw, 'koreanMeaning': row['koreanMeaning'], 'partOfSpeech': row['partOfSpeech'], 'acceptedAnswers': list(dict.fromkeys([study, *row.get('acceptedAnswers', [])]))}
            for field in ('exampleEn', 'exampleKo', 'collocations'):
                if row.get(field):
                    entry[field] = row[field]
            words.append(entry)
        lessons = []
        for start in range(0, len(words), 20):
            number = start // 20 + 1
            group = words[start:start + 20]
            lesson_id = f'course:{course_id}:stage:{number:03}'
            syntax = []
            readings = []
            for slot in (1, 2):
                focus, sentence = syntax_rows[(course_id, number, slot)]
                prompt, base_choices, explanation = GRAMMAR[focus]
                choices, correct = rotate(base_choices[0], base_choices[1:], (number + slot) % 4)
                syntax.append({'id': f'{lesson_id}:syntax:{slot}', 'sentenceEn': sentence, 'promptKo': prompt, 'choices': choices, 'correctIndex': correct, 'explanationKo': explanation, 'focus': focus, 'targetWordIds': targets(sentence, group), 'license': 'original', 'reviewStatus': 'approved'})
                reading_id = f'{lesson_id}:reading:{slot}'
                key = (course_id, number, slot)
                if key in reading_rows:
                    reading_title, passage, prompt, answer, wrong1, wrong2, wrong3, evidence, explanation = reading_rows[key]
                    choices, correct = rotate(answer, [wrong1, wrong2, wrong3], (number * 2 + slot) % 4)
                    question = {'id': reading_id + ':q1', 'promptKo': prompt, 'choices': choices, 'correctIndex': correct, 'explanationKo': explanation, 'evidenceQuote': evidence}
                else:
                    source_id = reuse[course_id][str(number)][slot - 1]
                    old = old_readings[source_id]
                    reading_title, passage = old['title'], old['passageEn']
                    question = {key: value for key, value in old['questions'][0].items() if key != 'type'}
                    question['id'] = reading_id + ':q1'
                    # Independent semantic review corrections apply to the new copy only.
                    if source_id == 'read-extra-014':
                        passage = re.sub(r'^[^.]+\.', 'A museum offered free entry to students who could prove their student status.', passage, count=1)
                    if source_id == 'read-extra-045':
                        previous = passage.rsplit('. ', 1)[-1]
                        replacement = 'The central challenge was to build a system that remained useful when future rainfall and local conditions differed from expectations.'
                        passage = passage[:-len(previous)] + replacement
                        if question['evidenceQuote'] in previous:
                            question['evidenceQuote'] = replacement
                    reused.append({'id': reading_id, 'sourceContentId': source_id, 'sourceQuestionId': old['questions'][0]['id']})
                readings.append({'id': reading_id, 'title': reading_title, 'passageEn': passage, 'question': question, 'targetWordIds': targets(passage, group), 'license': 'original', 'reviewStatus': 'approved'})
            lessons.append({'id': lesson_id, 'number': number, 'title': f'{number}회 · {group[0]["headword"]}부터 {group[-1]["headword"]}까지', 'wordIds': [row['id'] for row in group], 'sourceEntryIds': [row['sourceEntryId'] for row in group], 'syntax': syntax, 'readings': readings})
        documents.append({'schemaVersion': 1, 'id': course_id, 'title': title, 'version': '1.0.0', 'sourceWordbookIds': book_ids, 'vocabulary': words, 'lessons': lessons})
    report = validate(documents, reused)
    return documents, report


def validate(documents, reused):
    ids = set()
    passages = set()
    sentences = set()
    counts = {'courses': len(documents), 'lessons': 0, 'syntax': 0, 'readings': 0, 'wordMemberships': 0}
    lesson_coverage = []
    for document in documents:
        expected = 15 if document['id'] == 'advanced-300' else 100
        assert len(document['lessons']) == expected
        assert len(document['vocabulary']) == expected * 20
        assert [id for lesson in document['lessons'] for id in lesson['wordIds']] == [word['id'] for word in document['vocabulary']]
        assert [id for lesson in document['lessons'] for id in lesson['sourceEntryIds']] == [word['sourceEntryId'] for word in document['vocabulary']]
        for lesson in document['lessons']:
            assert len(lesson['wordIds']) == len(set(lesson['wordIds'])) == 20
            counts['lessons'] += 1
            counts['wordMemberships'] += 20
            assert len(lesson['syntax']) == len(lesson['readings']) == 2
            coverage = set()
            for item in lesson['syntax'] + lesson['readings']:
                assert item['id'] not in ids, item['id']
                ids.add(item['id'])
                assert item['license'] == 'original' and item['reviewStatus'] == 'approved'
                assert item['targetWordIds'], ('no daily target', item['id'])
                assert set(item['targetWordIds']) <= set(lesson['wordIds'])
                coverage.update(item['targetWordIds'])
                question = item.get('question', item)
                assert len(question['choices']) == len(set(question['choices'])) == 4
                assert 0 <= question['correctIndex'] < 4
                assert all(value.strip() for value in question['choices'])
                assert re.search('[가-힣]', question['explanationKo'])
                if 'passageEn' in item:
                    assert question['id'] not in ids
                    ids.add(question['id'])
                    passage = item['passageEn']
                    assert passage not in passages, ('duplicate passage', item['id'])
                    passages.add(passage)
                    assert question['evidenceQuote'] in passage, ('missing evidence', item['id'])
                    word_count = len(re.findall(r"\b[\w]+(?:['-][\w]+)*\b", passage))
                    limit = 300 if document['id'] == 'advanced-300' else 100
                    assert 50 <= word_count <= limit, ('passage length', item['id'], word_count)
                    counts['readings'] += 1
                else:
                    assert item['sentenceEn'] not in sentences, ('duplicate syntax', item['id'])
                    sentences.add(item['sentenceEn'])
                    counts['syntax'] += 1
            assert len(coverage) >= 6, ('insufficient daily coverage', lesson['id'], len(coverage))
            lesson_coverage.append({'id': lesson['id'], 'distinctTargetWords': len(coverage)})
    assert counts == {'courses': 2, 'lessons': 115, 'syntax': 230, 'readings': 230, 'wordMemberships': 2300}
    return {
        'status': 'validated',
        'reviewBasis': 'Owner-authorized adoption; original author semantic review and deterministic structural/evidence checks. Not independent teacher review.',
        'reviewRecord': {
            'advancedReusedReadings': {'count': 30, 'method': 'Independent agent reread of full passage, correct answer, explanation, and evidence; two consistency edits applied only in the new course copy.'},
            'newSuneungReadings': {'count': 200, 'method': 'Original contextual stories with author semantic review; learning_core stages 1-50, root 51-75, qa_docs 76-100. No glossary-list passage templates.'},
            'newSyntax': {'count': 230, 'method': 'Original contextual sentences reviewed against the stated grammatical relationship; repeated grammar prompts identify reusable skills, not generated answer guesses.'},
            'sourcePreservation': 'Existing seed untouched; 300 original IDs/order and 2000 PDF row IDs/order preserved, including all 176 overlaps. Study spellings vacuum/legacy are distinct from source spellings vaccum/lagacy.',
        },
        'counts': counts,
        'reusedReadings': reused,
        'lessonCoverage': lesson_coverage,
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    documents, report = build()
    outputs = {TARGET / f'{document["id"]}.json': document for document in documents}
    report['contentSha256'] = {path.name: hashlib.sha256((json.dumps(document, ensure_ascii=False, indent=2) + '\n').encode()).hexdigest() for path, document in outputs.items()}
    outputs[REPORT] = report
    for path, data in outputs.items():
        text = json.dumps(data, ensure_ascii=False, indent=2) + '\n'
        if args.check:
            assert path.read_text(encoding='utf-8') == text, ('stale output', str(path))
        else:
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(text, encoding='utf-8')
    print(json.dumps({'status': 'checked' if args.check else 'built', **report['counts']}, ensure_ascii=False))


if __name__ == '__main__':
    main()
