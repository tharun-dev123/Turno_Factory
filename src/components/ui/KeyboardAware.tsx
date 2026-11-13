import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ComponentProps,
  type ComponentRef,
  type RefObject,
} from 'react';
import {
  Keyboard,
  KeyboardAvoidingView,
  ScrollView,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type ScrollViewProps,
  View,
} from 'react-native';

type ViewInstance = ComponentRef<typeof View>;

/**
 * Keyboard handling shared by every screen with text inputs.
 *
 * Android apps built with Expo are edge-to-edge: the window does NOT resize when the keyboard opens, so a
 * KeyboardAvoidingView without a `behavior` leaves the content under the keyboard. `padding` is therefore used
 * on both platforms. KeyboardAvoidingView measures its own position against the keyboard, so it never adjusts
 * twice if a device does resize the window.
 */
export function KeyboardAvoider(props: ComponentProps<typeof KeyboardAvoidingView>) {
  return <KeyboardAvoidingView behavior="padding" {...props} />;
}

/** True while the software keyboard is open (used to drop bottom safe-area padding that the keyboard covers). */
export function useKeyboardVisible(): boolean {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', () => setVisible(true));
    const hide = Keyboard.addListener('keyboardDidHide', () => setVisible(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  return visible;
}

type EnsureFieldVisible = (field: RefObject<ViewInstance | null>) => void;

const EnsureFieldVisibleContext = createContext<EnsureFieldVisible | null>(null);

/** Used by TextField: call it when an input gains focus so the enclosing scroll view reveals it. */
export function useEnsureFieldVisible(): EnsureFieldVisible | null {
  return useContext(EnsureFieldVisibleContext);
}

export interface KeyboardAwareScrollViewProps extends ScrollViewProps {
  /**
   * Space to keep visible below the focused field (default 24). Use a larger value to also reveal what sits
   * under the field, for example the submit button on the login form.
   */
  scrollMargin?: number;
}

/**
 * ScrollView that keeps the focused TextField fully visible above the keyboard, also when the user moves from
 * one field to the next while the keyboard is already open. Pair it with a KeyboardAvoider around the screen so
 * the scroll view (and any sticky footer) shrinks to the space above the keyboard.
 */
export function KeyboardAwareScrollView({ scrollMargin = 24, onScroll, children, ...props }: KeyboardAwareScrollViewProps) {
  const scrollRef = useRef<ComponentRef<typeof ScrollView>>(null);
  const scrollY = useRef(0);
  const focusedField = useRef<RefObject<ViewInstance | null> | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const reveal = useCallback(
    (field: RefObject<ViewInstance | null>) => {
      const scroller = scrollRef.current;
      const node = field.current;
      if (!scroller || !node) return;
      // Both rectangles are measured in window coordinates, after the scroll view has been resized for the keyboard.
      scroller.measureInWindow?.((_x, scrollerTop, _w, viewportHeight) => {
        node.measureInWindow?.((_fx, fieldTop, _fw, fieldHeight) => {
          const top = fieldTop - scrollerTop;
          const bottom = top + fieldHeight;
          let delta = 0;
          if (bottom + scrollMargin > viewportHeight) {
            // Scroll down far enough, but never push the top of the field out of view.
            delta = Math.min(bottom + scrollMargin - viewportHeight, top - 8);
          }
          if (top < 8) delta = top - 8;
          if (delta !== 0) scroller.scrollTo({ y: Math.max(0, scrollY.current + delta), animated: true });
        });
      });
    },
    [scrollMargin],
  );

  const schedule = useCallback(
    (field: RefObject<ViewInstance | null>, delay: number) => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => reveal(field), delay);
    },
    [reveal],
  );

  const ensureVisible = useCallback<EnsureFieldVisible>(
    (field) => {
      focusedField.current = field;
      // Short delay: lets focus settle and, when the keyboard is already open, the layout finish updating.
      schedule(field, 80);
    },
    [schedule],
  );

  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', () => {
      if (focusedField.current) schedule(focusedField.current, 60);
    });
    const hide = Keyboard.addListener('keyboardDidHide', () => {
      focusedField.current = null;
    });
    return () => {
      show.remove();
      hide.remove();
      if (timer.current) clearTimeout(timer.current);
    };
  }, [schedule]);

  const handleScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    scrollY.current = event.nativeEvent.contentOffset.y;
    onScroll?.(event);
  };

  return (
    <EnsureFieldVisibleContext.Provider value={ensureVisible}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        scrollEventThrottle={16}
        {...props}
        ref={scrollRef}
        onScroll={handleScroll}
      >
        {children}
      </ScrollView>
    </EnsureFieldVisibleContext.Provider>
  );
}
