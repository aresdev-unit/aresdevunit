'use client';

import { useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';

interface LikeButtonProps {
  skillName: string;
  initialLikes: number;
}

export function LikeButton({ skillName, initialLikes }: LikeButtonProps) {
  const { data: session } = useSession();
  const router = useRouter();
  const [likes, setLikes] = useState(initialLikes);
  const [liked, setLiked] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleLike = async () => {
    if (!session) {
      router.push(`/login?redirect=/skills/${skillName}`);
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`/api/v1/skills/${encodeURIComponent(skillName)}/like`, {
        method: 'POST',
      });

      if (res.ok) {
        const data = await res.json();
        setLikes(data.likes);
        setLiked(data.liked);
      }
    } catch (error) {
      console.error('Failed to toggle like:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      onClick={handleLike}
      disabled={loading}
      className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border text-sm font-medium transition-colors ${
        liked
          ? 'bg-red-50 border-red-200 text-red-700 hover:bg-red-100'
          : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
      } disabled:opacity-50`}
      title={session ? (liked ? 'Unlike' : 'Like') : 'Login to like'}
    >
      <svg
        className={`h-4 w-4 ${liked ? 'fill-red-500 text-red-500' : 'fill-none text-gray-500'}`}
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"
        />
      </svg>
      {likes}
    </button>
  );
}
