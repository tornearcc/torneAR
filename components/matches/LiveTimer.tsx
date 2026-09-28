import { useEffect, useState } from 'react';
import { Text } from 'react-native';

interface Props {
  startedAt: string;
  className?: string;
}

function formatElapsed(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export function LiveTimer({ startedAt, className }: Props) {
  const [elapsed, setElapsed] = useState(() =>
    Math.max(0, Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000)),
  );

  useEffect(() => {
    const id = setInterval(() => {
      setElapsed(Math.max(0, Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000)));
    }, 1000);
    return () => clearInterval(id);
  }, [startedAt]);

  return (
    <Text className={className ?? 'font-displayBlack text-2xl text-danger-error'}>
      {formatElapsed(elapsed)}
    </Text>
  );
}
