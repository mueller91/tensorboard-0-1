/* Copyright 2018 The TensorFlow Authors. All Rights Reserved.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
==============================================================================*/
import * as d3 from 'd3';
import * as _ from 'lodash';
import * as Plottable from 'plottable';
import {PointerInteraction} from '../vz_chart_helpers/plottable-interactions';
import * as vz_chart_helpers from '../vz_chart_helpers/vz-chart-helpers';
import {
  SymbolFn,
  TooltipColumn,
  XComponents,
} from '../vz_chart_helpers/vz-chart-helpers';
import '../vz_chart_helpers/vz-chart-tooltip';
import {LinearScale} from './linear-scale';
import {LogScale} from './log-scale';
import {PanZoomDragLayer} from './panZoomDragLayer';
import {ITfScale} from './tf-scale';

/**
 * An interface that describes a fill area to visualize. The fill area is
 * visualized with a less intense version of the color for a given series.
 */
export interface FillArea {
  // The lower end of the fill area.
  lowerAccessor: Plottable.IAccessor<number>;
  // The higher end of the fill area.
  higherAccessor: Plottable.IAccessor<number>;
}
enum TooltipColumnEvalType {
  TEXT,
  DOM,
}

export enum YScaleType {
  LOG = 'log',
  LINEAR = 'linear',
}

export type LineChartStatus = {
  smoothingEnabled: boolean;
};

/**
 * Adds private APIs for default swatch column on the first column.
 */
interface LineChartTooltipColumn extends TooltipColumn {
  evalType: TooltipColumnEvalType;
  enter: () => void;
}

export type Metadata = {
  name: string;
  meta: any;
};
/**
 * The maximum number of marker symbols within any line for a data series. Too
 * many markers clutter the chart.
 */
const _MAX_MARKERS = 20;
export class LineChart {
  private name2datasets: {
    [name: string]: Plottable.Dataset;
  };
  private seriesNames: string[];
  private xAccessor: Plottable.IAccessor<number | Date>;
  private xScale: Plottable.QuantitativeScale<number | Date>;
  private yScale: ITfScale;
  private gridlines: Plottable.Components.Gridlines;
  private center: Plottable.Components.Group;
  private xAxis: Plottable.Axes.Numeric | Plottable.Axes.Time;
  private yAxis: Plottable.Axes.Numeric;
  private outer: Plottable.Components.Table;
  private colorScale: Plottable.Scales.Color;
  private symbolFunction: SymbolFn | undefined;
  private tooltipColumns: Array<
    LineChartTooltipColumn | LineChartTooltipColumn
  >;
  // VzChartTooltip; strong type removed to work around legacy element mixin export issue
  private tooltip: any;
  private tooltipInteraction: Plottable.Interactions.Pointer;
  private tooltipPointsComponent: Plottable.Component;
  private linePlot: Plottable.Plots.Line<number | Date>;
  private smoothLinePlot: Plottable.Plots.Line<number | Date>;
  private marginAreaPlot?: Plottable.Plots.Area<number | Date>;
  private scatterPlot: Plottable.Plots.Scatter<number | Date, Number>;
  private nanDisplay: Plottable.Plots.Scatter<number | Date, Number>;
  private markersScatterPlot: Plottable.Plots.Scatter<number | Date, number>;
  private yValueAccessor: Plottable.IAccessor<number>;
  private smoothedAccessor: Plottable.IAccessor<number>;
  private lastPointsDataset: Plottable.Dataset;
  private fillArea?: FillArea;
  private datasets: Plottable.Dataset[];
  private nanDataset: Plottable.Dataset;
  private smoothingWeight: number;
  private smoothingEnabled: boolean;
  private tooltipSortingMethod: string;
  private _ignoreYOutliers: boolean;
  private _ignoreYOutliersHalf: boolean;
  private _lastMousePosition: Plottable.Point;
  private _lastDrawBBox: DOMRect;
  private _redrawRaf: number;
  private _invalidateLayoutRaf: number;
  // An optional list of 2 numbers.
  private _defaultXRange: number[] | undefined;
  // An optional list of 2 numbers.
  private _defaultYRange: number[] | undefined;
  private _tooltipUpdateAnimationFrame: number;
  private targetSVG: d3.Selection<any, any, any, any>;
  constructor(
    xComponentsCreationMethod: () => XComponents,
    yValueAccessor: Plottable.IAccessor<number>,
    yScaleType: YScaleType,
    colorScale: Plottable.Scales.Color,
    tooltip: any, // VzChartTooltip
    tooltipColumns: TooltipColumn[],
    fillArea: FillArea,
    defaultXRange?: number[],
    defaultYRange?: number[],
    symbolFunction?: SymbolFn,
    xAxisFormatter?: (number) => string
  ) {
    this.seriesNames = [];
    this.name2datasets = {};
    this.colorScale = colorScale;
    this.tooltip = tooltip;
    this.datasets = [];
    this._ignoreYOutliers = false;
    this._ignoreYOutliersHalf = false;
    // lastPointDataset is a dataset that contains just the last point of
    // every dataset we're currently drawing.
    this.lastPointsDataset = new Plottable.Dataset();
    this.nanDataset = new Plottable.Dataset();
    this.yValueAccessor = yValueAccessor;
    // The symbol function maps series to marker. It uses a special dataset that
    // varies based on whether smoothing is enabled.
    this.symbolFunction = symbolFunction;
    this._defaultXRange = defaultXRange;
    this._defaultYRange = defaultYRange;
    this.tooltipColumns = tooltipColumns as any;
    this.buildChart(
      xComponentsCreationMethod,
      yValueAccessor,
      yScaleType,
      fillArea,
      xAxisFormatter
    );
  }
  private buildChart(
    xComponentsCreationMethod: () => XComponents,
    yValueAccessor: Plottable.IAccessor<number>,
    yScaleType: YScaleType,
    fillArea: FillArea,
    xAxisFormatter?: (number) => string
  ) {
    this.destroy();
    const xComponents = xComponentsCreationMethod();
    this.xAccessor = xComponents.accessor;
    this.xScale = xComponents.scale;
    this.xAxis = xComponents.axis;
    // Default margin is 15 pixels but we do not need it. Setting it to zero
    // makes space calculation a bit too tight and hide axis label by mistake.
    // To workaround the tight tolerance issue, we add 1px of margin.
    // See https://github.com/tensorflow/tensorboard/issues/5077.
    (this.xAxis.margin(1) as Plottable.Axes.Numeric).tickLabelPadding(3);
    if (xAxisFormatter) {
      this.xAxis.formatter(xAxisFormatter);
    }
    this.yScale = LineChart.getYScaleFromType(yScaleType);
    this.yScale.setValueProviderForDomain(() =>
      this.getValuesForYAxisDomainCompute()
    );
    this.yAxis = new Plottable.Axes.Numeric(this.yScale, 'left');
    let yFormatter = vz_chart_helpers.multiscaleFormatter(
      vz_chart_helpers.Y_AXIS_FORMATTER_PRECISION
    );
    (this.yAxis.margin(0) as Plottable.Axes.Numeric)
      .tickLabelPadding(5)
      .formatter(yFormatter);
    this.yAxis.usesTextWidthApproximation(true);
    this.fillArea = fillArea;
    const panZoomLayer = new PanZoomDragLayer(this.xScale, this.yScale, () =>
      this.resetDomain()
    );
    this.tooltipInteraction = this.createTooltipInteraction(panZoomLayer);
    this.tooltipPointsComponent = new Plottable.Component();
    const plot = this.buildPlot(this.xScale, this.yScale, fillArea);
    this.gridlines = new Plottable.Components.Gridlines(
      this.xScale,
      this.yScale
    );
    let xZeroLine: any = null;
    if (yScaleType !== YScaleType.LOG) {
      xZeroLine = new Plottable.Components.GuideLineLayer('horizontal');
      xZeroLine.scale(this.yScale).value(0);
    }
    let yZeroLine = new Plottable.Components.GuideLineLayer('vertical');
    yZeroLine.scale(this.xScale).value(0);
    this.center = new Plottable.Components.Group([
      this.gridlines,
      xZeroLine,
      yZeroLine,
      plot,
      this.tooltipPointsComponent,
      panZoomLayer,
    ]);
    this.center.addClass('main');
    this.outer = new Plottable.Components.Table([
      [this.yAxis, this.center],
      [null, this.xAxis],
    ]);
  }
  private buildPlot(xScale, yScale, fillArea): Plottable.Component {
    if (fillArea) {
      this.marginAreaPlot = new Plottable.Plots.Area<number | Date>();
      this.marginAreaPlot.x(this.xAccessor, xScale);
      this.marginAreaPlot.y(fillArea.higherAccessor, yScale);
      this.marginAreaPlot.y0(fillArea.lowerAccessor);
      this.marginAreaPlot.attr(
        'fill',
        (d: vz_chart_helpers.Datum, i: number, dataset: Plottable.Dataset) =>
          this.colorScale.scale(dataset.metadata().name)
      );
      this.marginAreaPlot.attr('fill-opacity', 0.3);
      this.marginAreaPlot.attr('stroke-width', 0);
    }
    this.smoothedAccessor = (d: vz_chart_helpers.ScalarDatum) => d.smoothed;
    let linePlot = new Plottable.Plots.Line<number | Date>();
    linePlot.x(this.xAccessor, xScale);
    linePlot.y(this.yValueAccessor, yScale);
    linePlot.attr(
      'stroke',
      (d: vz_chart_helpers.Datum, i: number, dataset: Plottable.Dataset) =>
        this.colorScale.scale(dataset.metadata().name)
    );
    this.linePlot = linePlot;
    this.setupTooltips(linePlot);
    let smoothLinePlot = new Plottable.Plots.Line<number | Date>();
    smoothLinePlot.x(this.xAccessor, xScale);
    smoothLinePlot.y(this.smoothedAccessor, yScale);
    smoothLinePlot.attr(
      'stroke',
      (d: vz_chart_helpers.Datum, i: number, dataset: Plottable.Dataset) =>
        this.colorScale.scale(dataset.metadata().name)
    );
    this.smoothLinePlot = smoothLinePlot;
    if (this.symbolFunction) {
      const markersScatterPlot = new Plottable.Plots.Scatter<
        number | Date,
        number
      >();
      markersScatterPlot.x(this.xAccessor, xScale);
      markersScatterPlot.y(this.yValueAccessor, yScale);
      markersScatterPlot.attr(
        'fill',
        (d: vz_chart_helpers.Datum, i: number, dataset: Plottable.Dataset) =>
          this.colorScale.scale(dataset.metadata().name)
      );
      markersScatterPlot.attr('opacity', 1);
      markersScatterPlot.size(vz_chart_helpers.TOOLTIP_CIRCLE_SIZE * 2);
      markersScatterPlot.symbol(
        (d: vz_chart_helpers.Datum, i: number, dataset: Plottable.Dataset) => {
          return this.symbolFunction!(dataset.metadata().name);
        }
      );
      // Use a special dataset because this scatter plot should use the accesor
      // that depends on whether smoothing is enabled.
      this.markersScatterPlot = markersScatterPlot;
    }
    // The scatterPlot will display the last point for each dataset.
    // This way, if there is only one datum for the series, it is still
    // visible. We hide it when tooltips are active to keep things clean.
    let scatterPlot = new Plottable.Plots.Scatter<number | Date, number>();
    scatterPlot.x(this.xAccessor, xScale);
    scatterPlot.y(this.yValueAccessor, yScale);
    scatterPlot.attr('fill', (d: any) => this.colorScale.scale(d.name));
    scatterPlot.attr('opacity', 1);
    scatterPlot.size(vz_chart_helpers.TOOLTIP_CIRCLE_SIZE * 2);
    scatterPlot.datasets([this.lastPointsDataset]);
    this.scatterPlot = scatterPlot;
    let nanDisplay = new Plottable.Plots.Scatter<number | Date, number>();
    nanDisplay.x(this.xAccessor, xScale);
    nanDisplay.y((x) => x.displayY, yScale);
    nanDisplay.attr('fill', (d: any) => this.colorScale.scale(d.name));
    nanDisplay.attr('opacity', 1);
    nanDisplay.size(vz_chart_helpers.NAN_SYMBOL_SIZE * 2);
    nanDisplay.datasets([this.nanDataset]);
    nanDisplay.symbol(Plottable.SymbolFactories.triangle);
    this.nanDisplay = nanDisplay;
    const groups = [nanDisplay, scatterPlot, smoothLinePlot, linePlot];
    if (this.marginAreaPlot) {
      groups.push(this.marginAreaPlot);
    }
    if (this.markersScatterPlot) {
      groups.push(this.markersScatterPlot);
    }
    return new Plottable.Components.Group(groups);
  }
  public ignoreYOutliers(ignoreYOutliers: boolean) {
    if (ignoreYOutliers !== this._ignoreYOutliers) {
      this._ignoreYOutliers = ignoreYOutliers;
      this.updateSpecialDatasets();
      this.yScale.ignoreOutlier(ignoreYOutliers);
      this.resetYDomain();
    }
  }
  public ignoreYOutliersHalf(ignoreYOutliersHalf: boolean) {
    if (ignoreYOutliersHalf !== this._ignoreYOutliersHalf) {
      this._ignoreYOutliersHalf = ignoreYOutliersHalf;
      this.updateSpecialDatasets();
      this.yScale.ignoreOutlier(ignoreYOutliersHalf);
      this.resetYDomain();
    }
  }
  private getValuesForYAxisDomainCompute(): number[] {
    const accessors = this.getAccessorsForComputingYRange();
    let datasetToValues: (d: Plottable.Dataset) => number[][] = (d) => {
      return accessors.map((accessor) =>
        d.data().map((x) => accessor(x, -1, d))
      );
    };
    return _.flattenDeep(this.datasets.map(datasetToValues)).filter(isFinite);
  }
  /** Constructs special datasets. Each special dataset contains exceptional
   * values from all of the regular datasets, e.g. last points in series, or
   * NaN values. Those points will have a `name` and `relative` property added
   * (since usually those are context in the surrounding dataset).
   */
  private updateSpecialDatasets() {
    const accessor = this.getYAxisAccessor();
    let lastPointsData = this.datasets
      .map((d) => {
        let datum: any = null;
        // filter out NaNs to ensure last point is a clean one
        let nonNanData = d.data().filter((x) => !isNaN(accessor(x, -1, d)));
        if (nonNanData.length > 0) {
          let idx = nonNanData.length - 1;
          datum = nonNanData[idx];
          datum.name = d.metadata().name;
          datum.relative = vz_chart_helpers.relativeAccessor(datum, -1, d);
        }
        return datum;
      })
      .filter((x) => x != null);
    this.lastPointsDataset.data(lastPointsData);
    if (this.markersScatterPlot) {
      this.markersScatterPlot.datasets(
        this.datasets.map(this.createSampledDatasetForMarkers)
      );
    }
    // Take a dataset, return an array of NaN data points
    // the NaN points will have a "displayY" property which is the
    // y-value of a nearby point that was not NaN (0 if all points are NaN)
    let datasetToNaNData = (d: Plottable.Dataset) => {
      let displayY: number | null = null;
      let data = d.data();
      let i = 0;
      while (i < data.length && displayY == null) {
        if (!isNaN(accessor(data[i], -1, d))) {
          displayY = accessor(data[i], -1, d);
        }
        i++;
      }
      if (displayY == null) {
        displayY = 0;
      }
      let nanData: any[] = [];
      for (i = 0; i < data.length; i++) {
        if (!isNaN(accessor(data[i], -1, d))) {
          displayY = accessor(data[i], -1, d);
        } else {
          data[i].name = d.metadata().name;
          data[i].displayY = displayY;
          data[i].relative = vz_chart_helpers.relativeAccessor(data[i], -1, d);
          nanData.push(data[i]);
        }
      }
      return nanData;
    };
    let nanData = _.flatten(this.datasets.map(datasetToNaNData));
    this.nanDataset.data(nanData);
  }
  public resetDomain() {
    this.resetXDomain();
    this.resetYDomain();
  }
  private resetXDomain() {
    let xDomain;
    if (this._defaultXRange != null) {
      // Use the range specified by the caller.
      xDomain = this._defaultXRange;
    } else {
      // (Copied from vz_line_chart.DragZoomLayer.unzoom.)
      const xScale = this.xScale as any;
      xScale._domainMin = null;
      xScale._domainMax = null;
      xDomain = xScale._getExtent();
    }
    this.xScale.domain(xDomain);
  }
  private resetYDomain() {
  if (this._ignoreYOutliers) {
    this.yScale.domain([-0.1, 1.1]);
  } else if (this._ignoreYOutliersHalf) {
    this.yScale.domain([0.4, 1.1]);
  } else if (this._defaultYRange != null) {
    this.yScale.domain(this._defaultYRange);
  } else {
    this.yScale.autoDomain();
    this.yScale.domain(this.yScale.domain());
  }
}
  private getAccessorsForComputingYRange(): Plottable.IAccessor<number>[] {
    const accessors = [this.getYAxisAccessor()];
    if (this.fillArea) {
      // Make the Y domain take margins into account.
      accessors.push(this.fillArea.lowerAccessor, this.fillArea.higherAccessor);
    }
    return accessors;
  }
  private getYAxisAccessor() {
    return this.smoothingEnabled ? this.smoothedAccessor : this.yValueAccessor;
  }
  private createTooltipInteraction(
    pzdl: PanZoomDragLayer
  ): Plottable.Interactions.Pointer {
    const pi = new PointerInteraction();
    // Disable interaction while drag zooming.
    const disableTooltipUpdate = () => {
      pi.enabled(false);
      this.hideTooltips();
    };
    const enableTooltipUpdate = () => pi.enabled(true);
    pzdl.onPanStart(disableTooltipUpdate);
    pzdl.onDragZoomStart(disableTooltipUpdate);
    pzdl.onPanEnd(enableTooltipUpdate);
    pzdl.onDragZoomEnd(enableTooltipUpdate);
    // When using wheel, cursor position does not change. Redraw the tooltip
    // using the last known mouse position.
    pzdl.onScrollZoom(() => this.updateTooltipContent(this._lastMousePosition));
    pi.onPointerMove((p: Plottable.Point) => {
      this._lastMousePosition = p;
      this.updateTooltipContent(p);
    });
    pi.onPointerExit(() => this.hideTooltips());
    return pi;
  }
  private updateTooltipContent(p: Plottable.Point): void {
    // Line plot must be initialized to draw.
    if (!this.linePlot) return;
    window.cancelAnimationFrame(this._tooltipUpdateAnimationFrame);
    this._tooltipUpdateAnimationFrame = window.requestAnimationFrame(() => {
      const target = {
        x: p.x,
        y: p.y,
      };
      let bbox: SVGRect = (<any>this.gridlines.content().node()).getBBox();
      // pts is the closets point to the tooltip for each dataset
      let pts: vz_chart_helpers.Point[] = this.linePlot
        .datasets()
        .map((dataset) => this.findClosestPoint(target, dataset))
        .filter((value): value is vz_chart_helpers.Point => Boolean(value));
      let intersectsBBox = Plottable.Utils.DOM.intersectsBBox;
      // We draw tooltips for points that are NaN, or are currently visible
      let ptsForTooltips: vz_chart_helpers.Point[] = pts.filter(
        (p) =>
          intersectsBBox(p.x, p.y, bbox) ||
          isNaN(this.yValueAccessor(p.datum, 0, p.dataset))
      );
      // Only draw little indicator circles for the non-NaN points
      let ptsToCircle = ptsForTooltips.filter(
        (p) => !isNaN(this.yValueAccessor(p.datum, 0, p.dataset))
      );
      if (pts.length !== 0) {
        this.scatterPlot.attr('display', 'none');
        const ptsSelection: any = this.tooltipPointsComponent
          .content()
          .selectAll('.point')
          .data(
            ptsToCircle,
            (p: vz_chart_helpers.Point) => p.dataset.metadata().name
          );
        ptsSelection.enter().append('circle').classed('point', true);
        ptsSelection
          .attr('r', vz_chart_helpers.TOOLTIP_CIRCLE_SIZE)
          .attr('cx', (p) => p.x)
          .attr('cy', (p) => p.y)
          .style('stroke', 'none')
          .attr('fill', (p) =>
            this.colorScale.scale(p.dataset.metadata().name)
          );
        ptsSelection.exit().remove();
        this.drawTooltips(ptsForTooltips, target, this.tooltipColumns);
      } else {
        this.hideTooltips();
      }
    });
  }
  private hideTooltips(): void {
    window.cancelAnimationFrame(this._tooltipUpdateAnimationFrame);
    this.tooltip.hide();
    this.scatterPlot.attr('display', 'block');
    this.tooltipPointsComponent.content().selectAll('.point').remove();
  }
  private setupTooltips(plot: Plottable.XYPlot<number | Date, number>): void {
    plot.onDetach(() => {
      this.tooltipInteraction.detachFrom(plot);
      this.tooltipInteraction.enabled(false);
    });
    plot.onAnchor(() => {
      this.tooltipInteraction.attachTo(plot);
      this.tooltipInteraction.enabled(true);
    });
  }
  private drawTooltips(
    points: vz_chart_helpers.Point[],
    target: {x: number; y: number},
    tooltipColumns: TooltipColumn[]
  ) {
    if (!points.length) {
      this.tooltip.hide();
      return;
    }
    const {colorScale} = this;
    const swatchCol = {
      title: '',
      static: false,
      evalType: TooltipColumnEvalType.DOM,
      evaluate(d: vz_chart_helpers.Point) {
        d3.select(this)
          .select('span')
          .style('background-color', () =>
            colorScale.scale(d.dataset.metadata().name)
          );
        return '';
      },
      enter(d: vz_chart_helpers.Point) {
        d3.select(this)
          .append('span')
          .classed('swatch', true)
          .style('background-color', () =>
            colorScale.scale(d.dataset.metadata().name)
          );
      },
    };
    tooltipColumns = [swatchCol, ...tooltipColumns];
    // Formatters for value, step, and wall_time
    let valueFormatter = vz_chart_helpers.multiscaleFormatter(
      vz_chart_helpers.Y_TOOLTIP_FORMATTER_PRECISION
    );
    const dist = (p: vz_chart_helpers.Point) =>
      Math.pow(p.x - target.x, 2) + Math.pow(p.y - target.y, 2);
    const closestDist = _.min(points.map(dist));
    const valueSortMethod = this.smoothingEnabled
      ? this.smoothedAccessor
      : this.yValueAccessor;
    if (this.tooltipSortingMethod === 'ascending') {
      points = _.sortBy(points, (d) => valueSortMethod(d.datum, -1, d.dataset));
    } else if (this.tooltipSortingMethod === 'descending') {
      points = _.sortBy(points, (d) =>
        valueSortMethod(d.datum, -1, d.dataset)
      ).reverse();
    } else if (this.tooltipSortingMethod === 'nearest') {
      points = _.sortBy(points, dist);
    } else {
      // The 'default' sorting method maintains the order of names passed to
      // setVisibleSeries(). However we reverse that order when defining the
      // datasets. So we must call reverse again to restore the order.
      points = points.slice(0).reverse();
    }
    const self = this;
    const table = d3.select(this.tooltip.content()).select('table');
    const header = table
      .select('thead')
      .selectAll('th')
      .data(tooltipColumns, (column: TooltipColumn, _, __) => {
        return column.title;
      });
    header
      .enter()
      .append('th')
      .text((col) => col.title)
      .nodes();
    header.exit().remove();
    const rows = table
      .select('tbody')
      .selectAll('tr')
      .data(points, (pt: vz_chart_helpers.Point, _, __) => {
        return pt.dataset.metadata().name;
      });
    rows
      .classed('distant', (d) => {
        // Grey out the point if any of the following are true:
        // - The cursor is outside of the x-extent of the dataset
        // - The point's y value is NaN
        let firstPoint = d.dataset.data()[0];
        let lastPoint = _.last(d.dataset.data());
        let firstX = this.xScale.scale(
          this.xAccessor(firstPoint, 0, d.dataset)
        );
        let lastX = this.xScale.scale(this.xAccessor(lastPoint, 0, d.dataset));
        let s = this.smoothingEnabled
          ? d.datum.smoothed
          : this.yValueAccessor(d.datum, 0, d.dataset);
        return target.x < firstX || target.x > lastX || isNaN(s);
      })
      .classed('closest', (p) => dist(p) === closestDist)
      .each(function (point) {
        self.drawTooltipRow(this, tooltipColumns, point);
      })
      // reorders DOM to match the ordering of the `data`.
      .order();
    rows.exit().remove();
    rows
      .enter()
      .append('tr')
      .each(function (point) {
        self.drawTooltipRow(this, tooltipColumns, point);
      })
      .nodes();
    this.tooltip.updateAndPosition(this.targetSVG.node());
  }
  private drawTooltipRow(
    row: d3.BaseType,
    tooltipColumns: TooltipColumn[],
    point: vz_chart_helpers.Point
  ) {
    const self = this;
    const columns = d3.select(row).selectAll('td').data(tooltipColumns);
    columns.each(function (col: TooltipColumn) {
      // Skip column value update when the column is static.
      if (col.static) return;
      self.drawTooltipColumn.call(self, this, col, point);
    });
    columns.exit().remove();
    columns
      .enter()
      .append('td')
      .each(function (col: TooltipColumn | LineChartTooltipColumn) {
        if ('enter' in col) {
          const customTooltip = col;
          customTooltip.enter.call(this, point);
        }
        self.drawTooltipColumn.call(self, this, col, point);
      });
  }
  private drawTooltipColumn(
    column: d3.BaseType,
    tooltipCol: TooltipColumn | LineChartTooltipColumn,
    point: vz_chart_helpers.Point
  ) {
    const {smoothingEnabled} = this;
    if (
      'evalType' in tooltipCol &&
      tooltipCol.evalType == TooltipColumnEvalType.DOM
    ) {
      tooltipCol.evaluate.call(column, point, {smoothingEnabled});
    } else {
      d3.select(column).text(
        tooltipCol.evaluate.call(column, point, {smoothingEnabled})
      );
    }
  }
  private findClosestPoint(
    target: {x: number; y: number},
    dataset: Plottable.Dataset
  ): vz_chart_helpers.Point | null {
    const xPoints: number[] = dataset
      .data()
      .map((d, i) => this.xScale.scale(this.xAccessor(d, i, dataset)));
    let idx: number = _.sortedIndex(xPoints, target.x);
    if (xPoints.length == 0) return null;
    if (idx === xPoints.length) {
      idx = idx - 1;
    } else if (idx !== 0) {
      const prevDist = Math.abs(xPoints[idx - 1] - target.x);
      const nextDist = Math.abs(xPoints[idx] - target.x);
      idx = prevDist < nextDist ? idx - 1 : idx;
    }
    const datum = dataset.data()[idx];
    const y = this.smoothingEnabled
      ? this.smoothedAccessor(datum, idx, dataset)
      : this.yValueAccessor(datum, idx, dataset);
    return {
      x: xPoints[idx],
      y: this.yScale.scale(y),
      datum,
      dataset,
    };
  }
  private resmoothDataset(dataset: Plottable.Dataset) {
    let data = dataset.data();
    const smoothingWeight = this.smoothingWeight;
    // 1st-order IIR low-pass filter to attenuate the higher-
    // frequency components of the time-series.
    let last = data.length > 0 ? 0 : NaN;
    let numAccum = 0;
    const yValues = data.map((d, i) => this.yValueAccessor(d, i, dataset));
    // See #786.
    const isConstant = yValues.every((v) => v == yValues[0]);
    data.forEach((d, i) => {
      const nextVal = yValues[i];
      if (isConstant || !Number.isFinite(nextVal)) {
        d.smoothed = nextVal;
      } else {
        last = last * smoothingWeight + (1 - smoothingWeight) * nextVal;
        numAccum++;
        // The uncorrected moving average is biased towards the initial value.
        // For example, if initialized with `0`, with smoothingWeight `s`, where
        // every data point is `c`, after `t` steps the moving average is
        // ```
        //   EMA = 0*s^(t) + c*(1 - s)*s^(t-1) + c*(1 - s)*s^(t-2) + ...
        //       = c*(1 - s^t)
        // ```
        // If initialized with `0`, dividing by (1 - s^t) is enough to debias
        // the moving average. We count the number of finite data points and
        // divide appropriately before storing the data.
        let debiasWeight = 1;
        if (smoothingWeight !== 1) {
          debiasWeight = 1 - Math.pow(smoothingWeight, numAccum);
        }
        d.smoothed = last / debiasWeight;
      }
    });
  }
  private getDataset(name: string) {
    if (this.name2datasets[name] === undefined) {
      this.name2datasets[name] = new Plottable.Dataset([], {
        name,
        meta: null,
      });
    }
    return this.name2datasets[name];
  }
  static getYScaleFromType(yScaleType: string): ITfScale {
    if (yScaleType === YScaleType.LOG) {
      return new LogScale();
    } else if (yScaleType === YScaleType.LINEAR) {
      return new LinearScale();
    } else {
      throw new Error('Unrecognized yScale type ' + yScaleType);
    }
  }
  /**
   * Stages update of visible series on the chart.
   *
   * Please call `commitChanges` for the changes to be reflected on the chart
   * after making all the changes.
   */
  public setVisibleSeries(names: string[]) {
    this.disableChanges();
    names = names.sort();
    names.reverse(); // draw first series on top
    this.seriesNames = names;
  }
  private dirtyDatasets = new Set<string>();
  private disableChanges() {
    if (!this.dirtyDatasets.size) {
      // Prevent plots from reacting to the dataset changes.
      this.linePlot.datasets([]);
      if (this.smoothLinePlot) {
        this.smoothLinePlot.datasets([]);
      }
      if (this.marginAreaPlot) {
        this.marginAreaPlot.datasets([]);
      }
    }
  }
  public commitChanges() {
    this.datasets = this.seriesNames.map((r) => this.getDataset(r));
    [...this.dirtyDatasets].forEach((d) => {
      if (this.smoothingEnabled) {
        this.resmoothDataset(this.getDataset(d));
      }
    });
    this.updateSpecialDatasets();
    this.linePlot.datasets(this.datasets);
    if (this.smoothingEnabled) {
      this.smoothLinePlot.datasets(this.datasets);
    }
    if (this.marginAreaPlot) {
      this.marginAreaPlot.datasets(this.datasets);
    }
    this.measureBBoxAndMaybeInvalidateLayoutInRaf();
    this.dirtyDatasets.clear();
  }
  /**
   * Samples a dataset so that it contains no more than _MAX_MARKERS number of
   * data points. This function returns the original dataset if it does not
   * exceed that many points.
   */
  public createSampledDatasetForMarkers(
    original: Plottable.Dataset
  ): Plottable.Dataset {
    const originalData = original.data();
    if (originalData.length <= _MAX_MARKERS) {
      // This dataset is small enough. Do not sample.
      return original;
    }
    // Downsample the data. Otherwise, too many markers clutter the chart.
    const skipLength = Math.ceil(originalData.length / _MAX_MARKERS);
    const data = new Array(Math.floor(originalData.length / skipLength));
    for (let i = 0, j = 0; i < data.length; i++, j += skipLength) {
      data[i] = originalData[j];
    }
    return new Plottable.Dataset(data, original.metadata());
  }
  /**
   * Stages a data change of a series on the chart.
   *
   * Please call `commitChanges` for the changes to be reflected on the chart
   * after making all the changes.
   */
  public setSeriesData(name: string, data: vz_chart_helpers.ScalarDatum[]) {
    this.disableChanges();
    this.getDataset(name).data(data);
    this.dirtyDatasets.add(name);
  }
  /**
   * Sets a metadata change of a series on the chart.
   *
   * Please call `commitChanges` for the changes to be reflected on the chart
   * after making all the changes.
   */
  public setSeriesMetadata(name: string, meta: any) {
    this.disableChanges();
    this.getDataset(name).metadata({
      ...this.getDataset(name).metadata(),
      meta,
    });
    this.dirtyDatasets.add(name);
  }
  public smoothingUpdate(weight: number) {
    this.smoothingWeight = weight;
    this.datasets.forEach((d) => this.resmoothDataset(d));
    if (!this.smoothingEnabled) {
      this.linePlot.addClass('ghost');
      this.scatterPlot.y(this.smoothedAccessor, this.yScale);
      this.smoothingEnabled = true;
      this.smoothLinePlot.datasets(this.datasets);
    }
    if (this.markersScatterPlot) {
      // Use the correct accessor for marker positioning.
      this.markersScatterPlot.y(this.getYAxisAccessor(), this.yScale);
    }
    this.updateSpecialDatasets();
  }
  public smoothingDisable() {
    if (this.smoothingEnabled) {
      this.linePlot.removeClass('ghost');
      this.scatterPlot.y(this.yValueAccessor, this.yScale);
      this.smoothLinePlot.datasets([]);
      this.smoothingEnabled = false;
      this.updateSpecialDatasets();
    }
    if (this.markersScatterPlot) {
      // Use the correct accessor (which depends on whether smoothing is
      // enabled) for marker positioning.
      this.markersScatterPlot.y(this.getYAxisAccessor(), this.yScale);
    }
  }
  public setColorScale(colorScale: Plottable.Scales.Color) {
    this.colorScale = colorScale;
  }
  public setTooltipColumns(tooltipColumns: TooltipColumn[]) {
    this.tooltipColumns = tooltipColumns as any;
  }
  public setTooltipSortingMethod(method: string) {
    this.tooltipSortingMethod = method;
  }
  public renderTo(targetSVG: d3.Selection<any, any, any, any>) {
    this.targetSVG = targetSVG;
    this.outer.renderTo(targetSVG);
    if (this._defaultXRange != null) {
      // A higher-level component provided a default range for the X axis.
      // Start with that range.
      this.resetXDomain();
    }
    if (this._defaultYRange != null) {
      // A higher-level component provided a default range for the Y axis.
      // Start with that range.
      this.resetYDomain();
    }
    this.measureBBoxAndMaybeInvalidateLayoutInRaf();
  }
  public redraw() {
    window.cancelAnimationFrame(this._redrawRaf);
    this._redrawRaf = window.requestAnimationFrame(() => {
      this.measureBBoxAndMaybeInvalidateLayout();
      this.outer.redraw();
    });
  }
  private measureBBoxAndMaybeInvalidateLayoutInRaf() {
    window.cancelAnimationFrame(this._invalidateLayoutRaf);
    this._invalidateLayoutRaf = window.requestAnimationFrame(() => {
      this.measureBBoxAndMaybeInvalidateLayout();
    });
  }
  /**
   * Measures bounding box of the anchor node and determines whether the layout
   * needs to be re-done with measurement cache invalidated. Plottable improved
   * performance of rendering by caching expensive DOM measurement but this
   * cache can be poisoned in case the anchor node is in a wrong state -- namely
   * `display: none` where all dimensions are 0.
   */
  private measureBBoxAndMaybeInvalidateLayout() {
    if (this._lastDrawBBox) {
      const {width: prevWidth} = this._lastDrawBBox;
      const {width} = this.targetSVG.node().getBoundingClientRect();
      if (prevWidth == 0 && prevWidth < width) this.outer.invalidateCache();
    }
    this._lastDrawBBox = this.targetSVG.node().getBoundingClientRect();
  }
  public destroy() {
    // Destroying outer destroys all subcomponents recursively.
    window.cancelAnimationFrame(this._redrawRaf);
    window.cancelAnimationFrame(this._invalidateLayoutRaf);
    if (this.outer) this.outer.destroy();
  }
  public onAnchor(fn: () => void) {
    if (this.outer) this.outer.onAnchor(fn);
  }
  /**
   * Returns whether the extent of rendered data values fits the current
   * chart viewport domain (includes smoothing and outlier detection).
   *
   * This is true when there is no data, and false when the domain has been
   * transformed from the extent via transformations (pan, zoom).
   */
  public isDataFitToDomain(): boolean {
    return (
      isDataFitToDomain(this.xAxis.getScale()) &&
      isDataFitToDomain(this.yAxis.getScale())
    );
    function isDataFitToDomain(scale) {
      /**
       * Domain represents the currently displayed region, possibly a zoomed
       * in or zoomed out view of the data.
       *
       * Extent represents the extent of the data, the range of all provided
       * datum values.
       */
      const domain = scale.getTransformationDomain();
      const extent = scale.getTransformationExtent();
      return extent[0] === domain[0] && extent[1] === domain[1];
    }
  }
}
