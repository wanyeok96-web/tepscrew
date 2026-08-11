/**
 * Question bank JSON validator
 */

const VALID_SECTIONS = new Set(['listening', 'vocabulary', 'grammar', 'reading']);

export function validateQuestion(question, index = 0) {
  const errors = [];
  const label = question?.id || `index:${index}`;

  if (!question || typeof question !== 'object') {
    return [{ id: label, message: '문항이 객체가 아닙니다.' }];
  }

  if (!question.id || typeof question.id !== 'string') {
    errors.push({ id: label, message: 'id가 없거나 문자열이 아닙니다.' });
  }

  if (!VALID_SECTIONS.has(question.section)) {
    errors.push({
      id: label,
      message: `section이 유효하지 않습니다. (${[...VALID_SECTIONS].join(', ')})`,
    });
  }

  if (
    typeof question.difficulty !== 'number' ||
    question.difficulty < 1 ||
    question.difficulty > 5
  ) {
    errors.push({ id: label, message: 'difficulty는 1~5 숫자여야 합니다.' });
  }

  if (!Array.isArray(question.choices) || question.choices.length !== 4) {
    errors.push({ id: label, message: 'choices는 정확히 4개여야 합니다.' });
  }

  if (
    typeof question.answer !== 'number' ||
    question.answer < 0 ||
    question.answer > 3 ||
    !Number.isInteger(question.answer)
  ) {
    errors.push({ id: label, message: 'answer는 0~3 정수여야 합니다.' });
  }

  if (!question.explanation || typeof question.explanation !== 'object') {
    errors.push({ id: label, message: 'explanation 객체가 필요합니다.' });
  } else {
    const ca = question.explanation.choiceAnalysis;
    if (!Array.isArray(ca) || ca.length !== 4) {
      errors.push({ id: label, message: 'explanation.choiceAnalysis는 4개여야 합니다.' });
    }
  }

  return errors;
}

export function validateQuestionBank(payload) {
  const result = {
    ok: false,
    packName: '문제 팩',
    total: 0,
    valid: 0,
    invalid: 0,
    errors: [],
    validQuestions: [],
    invalidQuestions: [],
  };

  let data = payload;
  let questions = [];

  if (typeof payload === 'string') {
    try {
      data = JSON.parse(payload);
    } catch {
      result.errors.push({ id: '-', message: 'JSON 파싱에 실패했습니다.' });
      return result;
    }
  }

  if (Array.isArray(data)) {
    questions = data;
    result.packName = 'Imported Questions';
  } else if (data && typeof data === 'object') {
    result.packName = data.name || data.packName || data.title || 'Imported Pack';
    if (Array.isArray(data.questions)) questions = data.questions;
    else {
      result.errors.push({ id: '-', message: 'questions 배열을 찾을 수 없습니다.' });
      return result;
    }
  } else {
    result.errors.push({ id: '-', message: '지원하지 않는 파일 형식입니다.' });
    return result;
  }

  result.total = questions.length;
  const seen = new Set();

  questions.forEach((q, index) => {
    const itemErrors = validateQuestion(q, index);

    if (q?.id) {
      if (seen.has(q.id)) {
        itemErrors.push({ id: q.id, message: 'id가 중복되었습니다.' });
      } else {
        seen.add(q.id);
      }
    }

    if (itemErrors.length) {
      result.invalid += 1;
      result.invalidQuestions.push(q);
      result.errors.push(...itemErrors);
    } else {
      result.valid += 1;
      result.validQuestions.push(q);
    }
  });

  result.ok = result.invalid === 0 && result.valid > 0;
  return result;
}
