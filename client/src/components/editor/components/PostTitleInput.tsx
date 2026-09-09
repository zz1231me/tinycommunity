// client/src/components/editor/components/PostTitleInput.tsx
//
// 스타일은 클래스로만 준다. 인라인 style 은 클래스로 덮을 수 없어, 배경색을 인라인으로
// 못 박으면 dark:bg-slate-700 이 적용되지 않는다.
import React from 'react';

interface PostTitleInputProps {
  value: string;
  onChange: (value: string) => void;
  maxLength: number;
}

const PostTitleInput: React.FC<PostTitleInputProps> = ({ value, onChange, maxLength }) => {
  // Defensive: Ensure value is never undefined
  const safeValue = value ?? '';

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    if (newValue.length <= maxLength) {
      onChange(newValue);
    }
  };

  return (
    <div>
      <label
        htmlFor="title"
        className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300"
      >
        제목
      </label>

      <div className="relative">
        <input
          id="title"
          type="text"
          className="w-full rounded-lg border border-slate-300 bg-white py-3 pl-4 pr-20 text-lg font-semibold text-slate-900 outline-none transition-all focus:border-transparent focus:ring-2 focus:ring-primary-500 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100"
          value={safeValue}
          onChange={handleChange}
          placeholder="제목을 입력하세요"
          required
        />
        <div className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-slate-500 dark:text-slate-400 pointer-events-none">
          {safeValue.length}/{maxLength}
        </div>
      </div>
    </div>
  );
};

export default PostTitleInput;
