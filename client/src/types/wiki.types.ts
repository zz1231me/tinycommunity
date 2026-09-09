export interface WikiRevisionEditor {
  id: string;
  name: string;
}

export interface WikiRevision {
  id: number;
  wikiPageId: number;
  editorId: string | null;
  editor?: WikiRevisionEditor | null;
  title: string;
  content: string;
  createdAt: string;
}

export type WikiPage = {
  id: number;
  slug: string;
  title: string;
  content: string;
  parentId: number | null;
  children?: WikiPage[];
  authorId: string;
  lastEditorId?: string | null;
  order: number;
  isPublished: boolean;
  createdAt: string;
  updatedAt: string;
};
