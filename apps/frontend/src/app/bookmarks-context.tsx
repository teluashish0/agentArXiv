"use client";

import { createContext, useContext, useSyncExternalStore } from "react";
import { useUser } from "@clerk/nextjs";

type BookmarkEntry = {
  paperId: string;
  addedAt: string;
};

type BookmarksContextValue = {
  bookmarks: BookmarkEntry[];
  isReady: boolean;
  isSignedIn: boolean;
  getBookmark: (paperId: string) => BookmarkEntry | undefined;
  toggleBookmark: (paperId: string) => void;
};

const STORAGE_PREFIX = "agentArXiv.bookmarks";
const EMPTY_BOOKMARKS: BookmarkEntry[] = [];
const bookmarkSnapshots = new Map<string, BookmarkEntry[]>();
const listeners = new Set<() => void>();
const BookmarksContext = createContext<BookmarksContextValue | null>(null);

function emitChange() {
  listeners.forEach((listener) => {
    listener();
  });
}

function subscribe(listener: () => void) {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
}

function getStorageKey(userId: string) {
  return `${STORAGE_PREFIX}.${userId}`;
}

function isBookmarkEntry(value: unknown): value is BookmarkEntry {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<BookmarkEntry>;

  return typeof candidate.paperId === "string" && typeof candidate.addedAt === "string";
}

function readStoredBookmarks(storageKey: string | null) {
  if (!storageKey || typeof window === "undefined") {
    return EMPTY_BOOKMARKS;
  }

  const cachedBookmarks = bookmarkSnapshots.get(storageKey);

  if (cachedBookmarks) {
    return cachedBookmarks;
  }

  const storedValue = window.localStorage.getItem(storageKey);

  if (!storedValue) {
    bookmarkSnapshots.set(storageKey, EMPTY_BOOKMARKS);

    return EMPTY_BOOKMARKS;
  }

  try {
    const parsedValue = JSON.parse(storedValue);

    if (!Array.isArray(parsedValue)) {
      bookmarkSnapshots.set(storageKey, EMPTY_BOOKMARKS);

      return EMPTY_BOOKMARKS;
    }

    const nextBookmarks = parsedValue.filter(isBookmarkEntry);
    const snapshot = nextBookmarks.length > 0 ? nextBookmarks : EMPTY_BOOKMARKS;

    bookmarkSnapshots.set(storageKey, snapshot);

    return snapshot;
  } catch {
    bookmarkSnapshots.set(storageKey, EMPTY_BOOKMARKS);

    return EMPTY_BOOKMARKS;
  }
}

function writeStoredBookmarks(storageKey: string, bookmarks: BookmarkEntry[]) {
  const nextBookmarks = bookmarks.length > 0 ? bookmarks : EMPTY_BOOKMARKS;

  bookmarkSnapshots.set(storageKey, nextBookmarks);
  window.localStorage.setItem(storageKey, JSON.stringify(nextBookmarks));
  emitChange();
}

export function BookmarksProvider({ children }: { children: React.ReactNode }) {
  const { isLoaded, isSignedIn, user } = useUser();
  const storageKey = isLoaded && isSignedIn && user ? getStorageKey(user.id) : null;
  const bookmarks = useSyncExternalStore(
    subscribe,
    () => readStoredBookmarks(storageKey),
    () => EMPTY_BOOKMARKS,
  );

  const value: BookmarksContextValue = {
    bookmarks,
    isReady: isLoaded,
    isSignedIn: Boolean(isSignedIn),
    getBookmark: (paperId) => bookmarks.find((bookmark) => bookmark.paperId === paperId),
    toggleBookmark: (paperId) => {
      if (!storageKey) {
        return;
      }

      const currentBookmarks = readStoredBookmarks(storageKey);
      const existingBookmark = currentBookmarks.find((bookmark) => bookmark.paperId === paperId);
      const nextBookmarks = existingBookmark
        ? currentBookmarks.filter((bookmark) => bookmark.paperId !== paperId)
        : [
            ...currentBookmarks,
            {
              paperId,
              addedAt: new Date().toISOString(),
            },
          ];

      writeStoredBookmarks(storageKey, nextBookmarks);
    },
  };

  return <BookmarksContext.Provider value={value}>{children}</BookmarksContext.Provider>;
}

export function useBookmarks() {
  const context = useContext(BookmarksContext);

  if (!context) {
    throw new Error("useBookmarks must be used within a BookmarksProvider");
  }

  return context;
}
