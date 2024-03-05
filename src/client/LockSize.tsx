import { memo, useEffect, useState } from "react";

export const useLockSize = (lock: boolean) => {
  const [ elem, setElem ] = useState<HTMLElement | null>(null);
  const [ elemStyle, setElemStyle ] = useState<React.CSSProperties | undefined>(undefined);

  useEffect(() => {
    if (!elem) { return; }
    if (lock) {
      const { width, height } = elem.getBoundingClientRect();
      setElemStyle({ width, height });
    } else {
      setElemStyle(undefined);
    }
  }, [elem, lock]);

  return [ setElem, elemStyle ] as const;
}

export const LockSize = memo((props: {
  children: React.ReactNode,
  lock: boolean
}) => {
  const { children, lock } = props;
  const [ setWrapper, wrapperStyle ] = useLockSize(lock);

  return <div style={{...wrapperStyle}} ref={setWrapper}>
    {children}
  </div>;
});
