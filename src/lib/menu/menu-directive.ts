/**
 * @license
 * Copyright Google LLC All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.io/license
 */

import {FocusKeyManager, FocusOrigin} from '@angular/cdk/a11y';
import {Direction} from '@angular/cdk/bidi';
import {coerceBooleanProperty} from '@angular/cdk/coercion';
import {ESCAPE, LEFT_ARROW, RIGHT_ARROW, DOWN_ARROW, UP_ARROW} from '@angular/cdk/keycodes';
import {
  AfterContentInit,
  ChangeDetectionStrategy,
  Component,
  ContentChild,
  ContentChildren,
  ElementRef,
  EventEmitter,
  Inject,
  InjectionToken,
  Input,
  NgZone,
  OnDestroy,
  Output,
  TemplateRef,
  QueryList,
  ViewChild,
  ViewEncapsulation,
  OnInit,
} from '@angular/core';
import {merge, Observable, Subject, Subscription} from 'rxjs';
import {startWith, switchMap, take} from 'rxjs/operators';
import {matMenuAnimations} from './menu-animations';
import {MatMenuContent} from './menu-content';
import {throwMatMenuInvalidPositionX, throwMatMenuInvalidPositionY} from './menu-errors';
import {MatMenuItem} from './menu-item';
import {MAT_MENU_PANEL, MatMenuPanel} from './menu-panel';
import {MenuPositionX, MenuPositionY} from './menu-positions';
import {AnimationEvent} from '@angular/animations';


/** Default `mat-menu` options that can be overridden. */
export interface MatMenuDefaultOptions {
  /** The x-axis position of the menu. */
  xPosition: MenuPositionX;

  /** The y-axis position of the menu. */
  yPosition: MenuPositionY;

  /** Whether the menu should overlap the menu trigger. */
  overlapTrigger: boolean;

  /** Class to be applied to the menu's backdrop. */
  backdropClass: string;

  /** Whether the menu has a backdrop. */
  hasBackdrop?: boolean;
}

/** Injection token to be used to override the default options for `mat-menu`. */
export const MAT_MENU_DEFAULT_OPTIONS =
    new InjectionToken<MatMenuDefaultOptions>('mat-menu-default-options', {
      providedIn: 'root',
      factory: MAT_MENU_DEFAULT_OPTIONS_FACTORY
    });

/** @docs-private */
export function MAT_MENU_DEFAULT_OPTIONS_FACTORY(): MatMenuDefaultOptions {
  return {
    overlapTrigger: true,
    xPosition: 'after',
    yPosition: 'below',
    backdropClass: 'cdk-overlay-transparent-backdrop',
  };
}
/**
 * Start elevation for the menu panel.
 * @docs-private
 */
const MAT_MENU_BASE_ELEVATION = 2;


@Component({
  moduleId: module.id,
  selector: 'mat-menu',
  templateUrl: 'menu.html',
  styleUrls: ['menu.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  exportAs: 'matMenu',
  animations: [
    matMenuAnimations.transformMenu,
    matMenuAnimations.fadeInItems
  ],
  providers: [
    {provide: MAT_MENU_PANEL, useExisting: MatMenu}
  ]
})
export class MatMenu implements AfterContentInit, MatMenuPanel<MatMenuItem>, OnInit, OnDestroy {
  private _keyManager: FocusKeyManager<MatMenuItem>;
  private _xPosition: MenuPositionX = this._defaultOptions.xPosition;
  private _yPosition: MenuPositionY = this._defaultOptions.yPosition;
  private _previousElevation: string;

  /** All items inside the menu. Includes items nested inside another menu. */
  @ContentChildren(MatMenuItem, {descendants: true}) _allItems: QueryList<MatMenuItem>;

  /** Only the direct descendant menu items. */
  private _directDescendantItems = new QueryList<MatMenuItem>();

  /** Subscription to tab events on the menu panel */
  private _tabSubscription = Subscription.EMPTY;

  /** Config object to be passed into the menu's ngClass */
  _classList: {[key: string]: boolean} = {};

  /** Current state of the panel animation. */
  _panelAnimationState: 'void' | 'enter' = 'void';

  /** Emits whenever an animation on the menu completes. */
  _animationDone = new Subject<AnimationEvent>();

  /** Whether the menu is animating. */
  _isAnimating: boolean;

  /** Parent menu of the current menu panel. */
  parentMenu: MatMenuPanel | undefined;

  /** Layout direction of the menu. */
  direction: Direction;

  /** Class to be added to the backdrop element. */
  @Input() backdropClass: string = this._defaultOptions.backdropClass;

  /** Position of the menu in the X axis. */
  @Input()
  get xPosition(): MenuPositionX { return this._xPosition; }
  set xPosition(value: MenuPositionX) {
    if (value !== 'before' && value !== 'after') {
      throwMatMenuInvalidPositionX();
    }
    this._xPosition = value;
    this.setPositionClasses();
  }

  /** Position of the menu in the Y axis. */
  @Input()
  get yPosition(): MenuPositionY { return this._yPosition; }
  set yPosition(value: MenuPositionY) {
    if (value !== 'above' && value !== 'below') {
      throwMatMenuInvalidPositionY();
    }
    this._yPosition = value;
    this.setPositionClasses();
  }

  /** @docs-private */
  @ViewChild(TemplateRef) templateRef: TemplateRef<any>;

  /**
   * List of the items inside of a menu.
   * @deprecated
   * @breaking-change 7.0.0
   */
  @ContentChildren(MatMenuItem) items: QueryList<MatMenuItem>;

  /**
   * Menu content that will be rendered lazily.
   * @docs-private
   */
  @ContentChild(MatMenuContent) lazyContent: MatMenuContent;

  /** Whether the menu should overlap its trigger. */
  @Input()
  get overlapTrigger(): boolean { return this._overlapTrigger; }
  set overlapTrigger(value: boolean) {
    this._overlapTrigger = coerceBooleanProperty(value);
  }
  private _overlapTrigger: boolean = this._defaultOptions.overlapTrigger;

  /** Whether the menu has a backdrop. */
  @Input()
  get hasBackdrop(): boolean | undefined { return this._hasBackdrop; }
  set hasBackdrop(value: boolean | undefined) {
    this._hasBackdrop = coerceBooleanProperty(value);
  }
  private _hasBackdrop: boolean | undefined = this._defaultOptions.hasBackdrop;

  /**
   * This method takes classes set on the host mat-menu element and applies them on the
   * menu template that displays in the overlay container.  Otherwise, it's difficult
   * to style the containing menu from outside the component.
   * @param classes list of class names
   */
  @Input('class')
  set panelClass(classes: string) {
    if (classes && classes.length) {
      this._classList = classes.split(' ').reduce((obj: any, className: string) => {
        obj[className] = true;
        return obj;
      }, {});

      this._elementRef.nativeElement.className = '';
    }
  }

  /**
   * This method takes classes set on the host mat-menu element and applies them on the
   * menu template that displays in the overlay container.  Otherwise, it's difficult
   * to style the containing menu from outside the component.
   * @deprecated Use `panelClass` instead.
   * @breaking-change 7.0.0
   */
  @Input()
  get classList(): string { return this.panelClass; }
  set classList(classes: string) { this.panelClass = classes; }

  /** Event emitted when the menu is closed. */
  @Output() readonly closed: EventEmitter<void | 'click' | 'keydown' | 'tab'> =
      new EventEmitter<void | 'click' | 'keydown' | 'tab'>();

  /**
   * Event emitted when the menu is closed.
   * @deprecated Switch to `closed` instead
   * @breaking-change 7.0.0
   */
  @Output() close = this.closed;

  constructor(
    private _elementRef: ElementRef,
    private _ngZone: NgZone,
    @Inject(MAT_MENU_DEFAULT_OPTIONS) private _defaultOptions: MatMenuDefaultOptions) { }

  ngOnInit() {
    this.setPositionClasses();
  }

  ngAfterContentInit() {
    this._updateDirectDescendants();
    this._keyManager = new FocusKeyManager(this._directDescendantItems).withWrap().withTypeAhead();
    this._tabSubscription = this._keyManager.tabOut.subscribe(() => this.closed.emit('tab'));
  }

  ngOnDestroy() {
    this._directDescendantItems.destroy();
    this._tabSubscription.unsubscribe();
    this.closed.complete();
  }

  /** Stream that emits whenever the hovered menu item changes. */
  _hovered(): Observable<MatMenuItem> {
    return this._directDescendantItems.changes.pipe(
      startWith(this._directDescendantItems),
      switchMap(items => merge(...items.map(item => item._hovered)))
    );
  }

  /** Handle a keyboard event from the menu, delegating to the appropriate action. */
  _handleKeydown(event: KeyboardEvent) {
    const keyCode = event.keyCode;

    switch (keyCode) {
      case ESCAPE:
        this.closed.emit('keydown');
        event.stopPropagation();
      break;
      case LEFT_ARROW:
        if (this.parentMenu && this.direction === 'ltr') {
          this.closed.emit('keydown');
        }
      break;
      case RIGHT_ARROW:
        if (this.parentMenu && this.direction === 'rtl') {
          this.closed.emit('keydown');
        }
      break;
      default:
        if (keyCode === UP_ARROW || keyCode === DOWN_ARROW) {
          this._keyManager.setFocusOrigin('keyboard');
        }

        this._keyManager.onKeydown(event);
    }
  }

  /**
   * Focus the first item in the menu.
   * @param origin Action from which the focus originated. Used to set the correct styling.
   */
  focusFirstItem(origin: FocusOrigin = 'program'): void {
    // When the content is rendered lazily, it takes a bit before the items are inside the DOM.
    if (this.lazyContent) {
      this._ngZone.onStable.asObservable()
        .pipe(take(1))
        .subscribe(() => this._keyManager.setFocusOrigin(origin).setFirstItemActive());
    } else {
      this._keyManager.setFocusOrigin(origin).setFirstItemActive();
    }
  }

  /**
   * Resets the active item in the menu. This is used when the menu is opened, allowing
   * the user to start from the first option when pressing the down arrow.
   */
  resetActiveItem() {
    this._keyManager.setActiveItem(-1);
  }

  /**
   * Sets the menu panel elevation.
   * @param depth Number of parent menus that come before the menu.
   */
  setElevation(depth: number): void {
    // The elevation starts at the base and increases by one for each level.
    const newElevation = `mat-elevation-z${MAT_MENU_BASE_ELEVATION + depth}`;
    const customElevation = Object.keys(this._classList).find(c => c.startsWith('mat-elevation-z'));

    if (!customElevation || customElevation === this._previousElevation) {
      if (this._previousElevation) {
        this._classList[this._previousElevation] = false;
      }

      this._classList[newElevation] = true;
      this._previousElevation = newElevation;
    }
  }

  /**
   * Adds classes to the menu panel based on its position. Can be used by
   * consumers to add specific styling based on the position.
   * @param posX Position of the menu along the x axis.
   * @param posY Position of the menu along the y axis.
   * @docs-private
   */
  setPositionClasses(posX: MenuPositionX = this.xPosition, posY: MenuPositionY = this.yPosition) {
    const classes = this._classList;
    classes['mat-menu-before'] = posX === 'before';
    classes['mat-menu-after'] = posX === 'after';
    classes['mat-menu-above'] = posY === 'above';
    classes['mat-menu-below'] = posY === 'below';
  }

  /** Starts the enter animation. */
  _startAnimation() {
    // @breaking-change 7.0.0 Combine with _resetAnimation.
    this._panelAnimationState = 'enter';
  }

  /** Resets the panel animation to its initial state. */
  _resetAnimation() {
    // @breaking-change 7.0.0 Combine with _startAnimation.
    this._panelAnimationState = 'void';
  }

  /** Callback that is invoked when the panel animation completes. */
  _onAnimationDone(event: AnimationEvent) {
    this._animationDone.next(event);
    this._isAnimating = false;

    // Scroll the content element to the top once the animation is done. This is necessary, because
    // we move focus to the first item while it's still being animated, which can throw the browser
    // off when it determines the scroll position. Alternatively we can move focus when the
    // animation is done, however moving focus asynchronously will interrupt screen readers
    // which are in the process of reading out the menu already. We take the `element` from
    // the `event` since we can't use a `ViewChild` to access the pane.
    if (event.toState === 'enter' && this._keyManager.activeItemIndex === 0) {
      event.element.scrollTop = 0;
    }
  }

  /**
   * Sets up a stream that will keep track of any newly-added menu items and will update the list
   * of direct descendants. We collect the descendants this way, because `_allItems` can include
   * items that are part of child menus, and using a custom way of registering items is unreliable
   * when it comes to maintaining the item order.
   */
  private _updateDirectDescendants() {
    this._allItems.changes
      .pipe(startWith(this._allItems))
      .subscribe((items: QueryList<MatMenuItem>) => {
        this._directDescendantItems.reset(items.filter(item => item._parentMenu === this));
        this._directDescendantItems.notifyOnChanges();
      });
  }
}
