// zod 가 스스로 만드는 거절 문구를 한글로 바꾼다.
//
// 스키마마다 메시지를 달아 두긴 했지만 빠진 규칙이 있었고, 그 자리에서는 영어가
// 그대로 사용자에게 갔다 — 대결 판돈에 큰 수를 넣으면
// "stake: Too big: expected number to be <=1000000" 이 화면에 떴다.
// 규칙 19곳에 하나씩 다는 대신 기본 문구를 바꾼다. 앞으로 쓰는 스키마도 한글이 된다.
//
// 스키마가 직접 적은 메시지가 있으면 zod 가 그것을 먼저 쓴다. 여기 있는 말은
// '아무도 적어 두지 않았을 때' 의 기본값이다.

import { z } from 'zod';

const 수 = (v: unknown) => (typeof v === 'number' ? v.toLocaleString() : String(v));

/** 셀 수 있는 것의 이름. '3자' 와 '3개' 를 가른다. */
function unitOf(origin: unknown): { label: string; unit: string } {
  switch (origin) {
    case 'string':
      return { label: '글자 수는', unit: '자' };
    case 'array':
    case 'set':
      return { label: '개수는', unit: '개' };
    case 'date':
      return { label: '날짜는', unit: '' };
    default:
      return { label: '값은', unit: '' };
  }
}

const TYPE_NAMES: Record<string, string> = {
  string: '글자',
  number: '숫자',
  boolean: '참·거짓',
  array: '목록',
  object: '객체',
  date: '날짜',
  bigint: '정수',
};

const FORMAT_NAMES: Record<string, string> = {
  email: '전자우편 주소',
  url: '주소(URL)',
  uuid: '식별자(UUID)',
  datetime: '날짜·시각',
  date: '날짜',
  time: '시각',
  regex: '정해진 형식',
};

export function installKoreanZodMessages(): void {
  z.config({
    customError: iss => {
      switch (iss.code) {
        case 'invalid_type':
          // 값이 아예 없는 것과, 다른 종류가 온 것은 사람에게 다른 일이다.
          if (iss.input === undefined) return '필수 항목입니다.';
          return `${TYPE_NAMES[String(iss.expected)] ?? String(iss.expected)} 이어야 합니다.`;

        case 'too_big': {
          const { label, unit } = unitOf(iss.origin);
          const 끝 = iss.inclusive === false ? '보다 작아야 합니다.' : ' 이하여야 합니다.';
          return `${label} ${수(iss.maximum)}${unit}${끝}`;
        }

        case 'too_small': {
          const { label, unit } = unitOf(iss.origin);
          const 끝 = iss.inclusive === false ? '보다 커야 합니다.' : ' 이상이어야 합니다.';
          return `${label} ${수(iss.minimum)}${unit}${끝}`;
        }

        case 'not_multiple_of':
          return `${수(iss.divisor)} 의 배수여야 합니다.`;

        case 'invalid_value': {
          const values = Array.isArray(iss.values) ? iss.values : [];
          return values.length > 0
            ? `${values.join(', ')} 중에서 골라주세요.`
            : '고를 수 없는 값입니다.';
        }

        case 'invalid_format':
          return `${FORMAT_NAMES[String(iss.format)] ?? '정해진 형식'} 모양이 아닙니다.`;

        case 'unrecognized_keys':
          return '알 수 없는 항목이 섞여 있습니다.';

        case 'invalid_union':
          return '값의 모양이 맞지 않습니다.';

        case 'invalid_key':
        case 'invalid_element':
          return '값의 모양이 맞지 않습니다.';

        default:
          return '올바르지 않은 값입니다.';
      }
    },
  });
}
