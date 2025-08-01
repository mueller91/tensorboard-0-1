# TensorBoard [![GitHub Actions CI](https://github.com/tensorflow/tensorboard/workflows/CI/badge.svg)](https://github.com/tensorflow/tensorboard/actions?query=workflow%3ACI+branch%3Amaster+event%3Apush) [![GitHub Actions Nightly CI](https://github.com/tensorflow/tensorboard/workflows/nightly-release/badge.svg)](https://github.com/tensorflow/tensorboard/actions?query=workflow%3Anightly-release+branch%3Amaster) [![PyPI](https://badge.fury.io/py/tensorboard.svg)](https://badge.fury.io/py/tensorboard)

To run, do:
1) Install tensorboard via pip install (in a new conda env). We need it s.t. we have tensorboards requirements.
2) Run the following:
```
bazel run //tensorboard -- --logdir=...
```


TensorBoard is a suite of web applications for inspecting and understanding your
TensorFlow runs and graphs.

This README gives an overview of key concepts in TensorBoard, as well as how to
interpret the visualizations TensorBoard provides. For an in-depth example of
using TensorBoard, see the tutorial: [TensorBoard: Getting Started][].
Documentation on how to use TensorBoard to work with images, graphs, hyper
parameters, and more are linked from there, along with tutorial walk-throughs in
Colab.

TensorBoard is designed to run entirely offline, without requiring any access
to the Internet. For instance, this may be on your local machine, behind a
corporate firewall, or in a datacenter.

[TensorBoard: Getting Started]: https://www.tensorflow.org/tensorboard/get_started
[TensorBoard.dev]: https://tensorboard.dev
[This experiment]: https://tensorboard.dev/experiment/EDZb7XgKSBKo6Gznh3i8hg/#scalars

# Usage

Before running TensorBoard, make sure you have generated summary data in a log
directory by creating a summary writer:

``` python
# sess.graph contains the graph definition; that enables the Graph Visualizer.

file_writer = tf.summary.FileWriter('/path/to/logs', sess.graph)
```

For more details, see
[the TensorBoard tutorial](https://www.tensorflow.org/get_started/summaries_and_tensorboard).
Once you have event files, run TensorBoard and provide the log directory. If
you're using a precompiled TensorFlow package (e.g. you installed via pip), run:

```
tensorboard --logdir path/to/logs
```

Or, if you are building from source:

```bash
bazel build tensorboard:tensorboard
./bazel-bin/tensorboard/tensorboard --logdir path/to/logs

# or even more succinctly
bazel run tensorboard -- --logdir path/to/logs
```

This should print that TensorBoard has started. Next, connect to
http://localhost:6006.

TensorBoard requires a `logdir` to read logs from. For info on configuring
TensorBoard, run `tensorboard --help`.

TensorBoard can be used in Google Chrome or Firefox. Other browsers might
work, but there may be bugs or performance issues.

# Key Concepts

### Summary Ops: How TensorBoard gets data from TensorFlow

The first step in using TensorBoard is acquiring data from your TensorFlow run.
For this, you need
[summary ops](https://www.tensorflow.org/api_docs/python/tf/summary).
Summary ops are ops, just like
[`tf.matmul`](https://www.tensorflow.org/api_docs/python/tf/linalg/matmul)
and
[`tf.nn.relu`](https://www.tensorflow.org/api_docs/python/tf/nn/relu),
which means they take in tensors, produce tensors, and are evaluated from within
a TensorFlow graph. However, summary ops have a twist: the Tensors they produce
contain serialized protobufs, which are written to disk and sent to TensorBoard.
To visualize the summary data in TensorBoard, you should evaluate the summary
op, retrieve the result, and then write that result to disk using a
summary.FileWriter. A full explanation, with examples, is in [the
tutorial](https://www.tensorflow.org/get_started/summaries_and_tensorboard).

The supported summary ops include:
* [`tf.summary.scalar`](https://www.tensorflow.org/api_docs/python/tf/summary/scalar)
* [`tf.summary.image`](https://www.tensorflow.org/api_docs/python/tf/summary/image)
* [`tf.summary.audio`](https://www.tensorflow.org/api_docs/python/tf/summary/audio)
* [`tf.summary.text`](https://www.tensorflow.org/api_docs/python/tf/summary/text)
* [`tf.summary.histogram`](https://www.tensorflow.org/api_docs/python/tf/summary/histogram)

### Tags: Giving names to data

When you make a summary op, you will also give it a `tag`. The tag is basically
a name for the data recorded by that op, and will be used to organize the data
in the frontend. The scalar and histogram dashboards organize data by tag, and
group the tags into folders according to a directory/like/hierarchy. If you have
a lot of tags, we recommend grouping them with slashes.

### Event Files & LogDirs: How TensorBoard loads the data

`summary.FileWriters` take summary data from TensorFlow, and then write them to a
specified directory, known as the `logdir`. Specifically, the data is written to
an append-only record dump that will have "tfevents" in the filename.
TensorBoard reads data from a full directory, and organizes it into the history
of a single TensorFlow execution.

Why does it read the whole directory, rather than an individual file? You might
have been using
[supervisor.py](https://github.com/tensorflow/tensorflow/blob/master/tensorflow/python/training/supervisor.py)
to run your model, in which case if TensorFlow crashes, the supervisor will
restart it from a checkpoint. When it restarts, it will start writing to a new
events file, and TensorBoard will stitch the various event files together to
produce a consistent history of what happened.

### Runs: Comparing different executions of your model

You may want to visually compare multiple executions of your model; for example,
suppose you've changed the hyperparameters and want to see if it's converging
faster. TensorBoard enables this through different "runs". When TensorBoard is
passed a `logdir` at startup, it recursively walks the directory tree rooted at
`logdir` looking for subdirectories that contain tfevents data. Every time it
encounters such a subdirectory, it loads it as a new `run`, and the frontend
will organize the data accordingly.

For example, here is a well-organized TensorBoard log directory, with two runs,
"run1" and "run2".

```
/some/path/mnist_experiments/
/some/path/mnist_experiments/run1/
/some/path/mnist_experiments/run1/events.out.tfevents.1456525581.name
/some/path/mnist_experiments/run1/events.out.tfevents.1456525585.name
/some/path/mnist_experiments/run2/
/some/path/mnist_experiments/run2/events.out.tfevents.1456525385.name
/tensorboard --logdir /some/path/mnist_experiments
```

#### Logdir & Logdir_spec (Legacy Mode)

You may also pass a comma separated list of log directories, and TensorBoard
will watch each directory. You can also assign names to individual log
directories by putting a colon between the name and the path, as in

```
tensorboard --logdir_spec name1:/path/to/logs/1,name2:/path/to/logs/2
```

_This flag (`--logdir_spec`) is discouraged and can usually be avoided_. TensorBoard walks log directories recursively; for finer-grained control, prefer using a symlink tree. _Some features may not work when using `--logdir_spec` instead of `--logdir`._

# The Visualizations

### Scalar Dashboard

TensorBoard's Scalar Dashboard visualizes scalar statistics that vary over time;
for example, you might want to track the model's loss or learning rate. As
described in *Key Concepts*, you can compare multiple runs, and the data is
organized by tag. The line charts have the following interactions:

* Clicking on the small blue icon in the lower-left corner of each chart will
expand the chart

* Dragging a rectangular region on the chart will zoom in

* Double clicking on the chart will zoom out

* Mousing over the chart will produce crosshairs, with data values recorded in
the run-selector on the left.

Additionally, you can create new folders to organize tags by writing regular
expressions in the box in the top-left of the dashboard.

### Histogram Dashboard

The Histogram Dashboard displays how the statistical distribution of a Tensor
has varied over time. It visualizes data recorded via `tf.summary.histogram`.
Each chart shows temporal "slices" of data, where each slice is a histogram of
the tensor at a given step. It's organized with the oldest timestep in the back,
and the most recent timestep in front. By changing the Histogram Mode from
"offset" to "overlay", the perspective will rotate so that every histogram slice
is rendered as a line and overlaid with one another.

### Distribution Dashboard

The Distribution Dashboard is another way of visualizing histogram data from
`tf.summary.histogram`. It shows some high-level statistics on a distribution.
Each line on the chart represents a percentile in the distribution over the
data: for example, the bottom line shows how the minimum value has changed over
time, and the line in the middle shows how the median has changed. Reading from
top to bottom, the lines have the following meaning: `[maximum, 93%, 84%, 69%,
50%, 31%, 16%, 7%, minimum]`

These percentiles can also be viewed as standard deviation boundaries on a
normal distribution: `[maximum, μ+1.5σ, μ+σ, μ+0.5σ, μ, μ-0.5σ, μ-σ, μ-1.5σ,
minimum]` so that the colored regions, read from inside to outside, have widths
`[σ, 2σ, 3σ]` respectively.

### Image Dashboard

The Image Dashboard can display pngs that were saved via a `tf.summary.image`.
The dashboard is set up so that each row corresponds to a different tag, and
each column corresponds to a run. Since the image dashboard supports arbitrary
pngs, you can use this to embed custom visualizations (e.g. matplotlib
scatterplots) into TensorBoard. This dashboard always shows you the latest image
for each tag.

### Audio Dashboard

The Audio Dashboard can embed playable audio widgets for audio saved via a
`tf.summary.audio`. The dashboard is set up so that each row corresponds to a
different tag, and each column corresponds to a run. This dashboard always
embeds the latest audio for each tag.

### Graph Explorer

The Graph Explorer can visualize a TensorBoard graph, enabling inspection of the
TensorFlow model. To get best use of the graph visualizer, you should use name
scopes to hierarchically group the ops in your graph - otherwise, the graph may
be difficult to decipher. For more information, including examples, see the
[examining the TensorFlow graph](https://www.tensorflow.org/tensorboard/graphs)
tutorial.

### Embedding Projector

The Embedding Projector allows you to visualize high-dimensional data; for
example, you may view your input data after it has been embedded in a high-
dimensional space by your model. The embedding projector reads data from your
model checkpoint file, and may be configured with additional metadata, like
a vocabulary file or sprite images. For more details, see [the embedding
projector tutorial](https://www.tensorflow.org/tutorials/text/word_embeddings).

### Text Dashboard

The Text Dashboard displays text snippets saved via `tf.summary.text`. Markdown
features including hyperlinks, lists, and tables are all supported.

### Time Series Dashboard

The Time Series Dashboard shows a unified interface containing all your Scalars,
Histograms, and Images saved via `tf.summary.scalar`, `tf.summary.image`, or
`tf.summary.histogram`. It enables viewing your 'accuracy' line chart side by
side with activation histograms and training example images, for example.

Features include:

* Custom run colors: click on the colored circles in the run selector to change
a run's color.

* Pinned cards: click the 'pin' icon on any card to add it to the pinned section
at the top for quick comparison.

* Settings: the right pane offers settings for charts and other visualizations.
Important settings will persist across TensorBoard sessions, when hosted at the
same URL origin.

* Autocomplete in tag filter: search for specific charts more easily.

# Frequently Asked Questions

### My TensorBoard isn't showing any data! What's wrong?

First, check that the directory passed to `--logdir` is correct. You can also
verify this by navigating to the Scalars dashboard (under the "Inactive" menu)
and looking for the log directory path at the bottom of the left sidebar.

If you're loading from the proper path, make sure that event files are present.
TensorBoard will recursively walk its logdir, it's fine if the data is nested
under a subdirectory. Ensure the following shows at least one result:

`find DIRECTORY_PATH | grep tfevents`

You can also check that the event files actually have data by running
tensorboard in inspect mode to inspect the contents of your event files.

`tensorboard --inspect --logdir DIRECTORY_PATH`

The output for an event file corresponding to a blank TensorBoard may
still sometimes show a few steps, representing a few initial events that
aren't shown by TensorBoard (for example, when using the Keras TensorBoard callback):

```
tensor
   first_step           0
   last_step            2
   max_step             2
   min_step             0
   num_steps            2
   outoforder_steps     [(2, 0), (2, 0), (2, 0)]
```

In contrast, the output for an event file with more data might look like this:

```
tensor
   first_step           0
   last_step            55
   max_step             250
   min_step             0
   num_steps            60
   outoforder_steps     [(2, 0), (2, 0), (2, 0), (2, 0), (50, 9), (100, 19), (150, 29), (200, 39), (250, 49)]
```

### TensorBoard is showing only some of my data, or isn't properly updating!

> **Update:** After [2.3.0 release][2-3-0], TensorBoard no longer auto reloads
> every 30 seconds. To re-enable the behavior, please open the settings by
> clicking the gear icon in the top-right of the TensorBoard web interface, and
> enable "Reload data".

> **Update:** the [experimental `--reload_multifile=true` option][pr-1867] can
> now be used to poll all "active" files in a directory for new data, rather
> than the most recent one as described below. A file is "active" as long as it
> received new data within `--reload_multifile_inactive_secs` seconds ago,
> defaulting to 86400.

This issue usually comes about because of how TensorBoard iterates through the
`tfevents` files: it progresses through the events file in timestamp order, and
only reads one file at a time. Let's suppose we have files with timestamps `a`
and `b`, where `a<b`. Once TensorBoard has read all the events in `a`, it will
never return to it, because it assumes any new events are being written in the
more recent file. This could cause an issue if, for example, you have two
`FileWriters` simultaneously writing to the same directory. If you have
multiple summary writers, each one should be writing to a separate directory.

### Does TensorBoard support multiple or distributed summary writers?

> **Update:** the [experimental `--reload_multifile=true` option][pr-1867] can
> now be used to poll all "active" files in a directory for new data, defined as
> any file that received new data within `--reload_multifile_inactive_secs`
> seconds ago, defaulting to 86400.

No. TensorBoard expects that only one events file will be written to at a time,
and multiple summary writers means multiple events files. If you are running a
distributed TensorFlow instance, we encourage you to designate a single worker
as the "chief" that is responsible for all summary processing. See
[supervisor.py](https://github.com/tensorflow/tensorflow/blob/master/tensorflow/python/training/supervisor.py)
for an example.

### I'm seeing data overlapped on itself! What gives?

If you are seeing data that seems to travel backwards through time and overlap
with itself, there are a few possible explanations.

* You may have multiple execution of TensorFlow that all wrote to the same log
directory. Please have each TensorFlow run write to its own logdir.

  > **Update:** the [experimental `--reload_multifile=true` option][pr-1867] can
  > now be used to poll all "active" files in a directory for new data, defined
  > as any file that received new data within `--reload_multifile_inactive_secs`
  > seconds ago, defaulting to 86400.

* You may have a bug in your code where the global_step variable (passed
to `FileWriter.add_summary`) is being maintained incorrectly.

* It may be that your TensorFlow job crashed, and was restarted from an earlier
checkpoint. See *How to handle TensorFlow restarts*, below.

As a workaround, try changing the x-axis display in TensorBoard from `steps` to
`wall_time`. This will frequently clear up the issue.

### How should I handle TensorFlow restarts?

TensorFlow is designed with a mechanism for graceful recovery if a job crashes
or is killed: TensorFlow can periodically write model checkpoint files, which
enable you to restart TensorFlow without losing all your training progress.

However, this can complicate things for TensorBoard; imagine that TensorFlow
wrote a checkpoint at step `a`, and then continued running until step `b`, and
then crashed and restarted at timestamp `a`. All of the events written between
`a` and `b` were "orphaned" by the restart event and should be removed.

To facilitate this, we have a `SessionLog` message in
`tensorflow/core/util/event.proto` which can record `SessionStatus.START` as an
event; like all events, it may have a `step` associated with it. If TensorBoard
detects a `SessionStatus.START` event with step `a`, it will assume that every
event with a step greater than `a` was orphaned, and it will discard those
events. This behavior may be disabled with the flag
`--purge_orphaned_data false` (in versions after 0.7).

### How can I export data from TensorBoard?

The Scalar Dashboard supports exporting data; you can click the "enable
download links" option in the left-hand bar. Then, each plot will provide
download links for the data it contains.

If you need access to the full dataset, you can read the event files that
TensorBoard consumes by using the [`summary_iterator`](
https://www.tensorflow.org/api_docs/python/tf/compat/v1/train/summary_iterator)
method.

### Can I make my own plugin?

Yes! You can clone and tinker with one of the [examples][plugin-examples] and
make your own, amazing visualizations. More documentation on the plugin system
is described in the [ADDING_A_PLUGIN](./ADDING_A_PLUGIN.md) guide. Feel free to
file feature requests or questions about plugin functionality.

Once satisfied with your own groundbreaking new plugin, see the
[distribution section][plugin-distribution] on how to publish to PyPI and share
it with the community.

[plugin-examples]: ./tensorboard/examples/plugins
[plugin-distribution]: ./ADDING_A_PLUGIN.md#distribution

### Can I customize which lines appear in a plot?

Using the [custom scalars plugin](tensorboard/plugins/custom_scalar), you can
create scalar plots with lines for custom run-tag pairs. However, within the
original scalars dashboard, each scalar plot corresponds to data for a specific
tag and contains lines for each run that includes that tag.

### Can I visualize margins above and below lines?

Margin plots (that visualize lower and upper bounds) may be created with the
[custom scalars plugin](tensorboard/plugins/custom_scalar). The original
scalars plugin does not support visualizing margins.

### Can I create scatterplots (or other custom plots)?

This isn't yet possible. As a workaround, you could create your custom plot in
your own code (e.g. matplotlib) and then write it into an `SummaryProto`
(`core/framework/summary.proto`) and add it to your `FileWriter`. Then, your
custom plot will appear in the TensorBoard image tab.

### Is my data being downsampled? Am I really seeing all the data?

TensorBoard uses [reservoir
sampling](https://en.wikipedia.org/wiki/Reservoir_sampling) to downsample your
data so that it can be loaded into RAM. You can modify the number of elements it
will keep per tag by using the `--samples_per_plugin` command line argument (ex:
`--samples_per_plugin=scalars=500,images=20`).
See this [Stack Overflow question](http://stackoverflow.com/questions/43702546/tensorboard-doesnt-show-all-data-points/)
for some more information.

### I get a network security popup every time I run TensorBoard on a mac!

Versions of TensorBoard prior to TensorBoard 2.0 would by default serve on host
`0.0.0.0`, which is publicly accessible. For those versions of TensorBoard, you
can stop the popups by specifying `--host localhost` at startup.

In TensorBoard 2.0 and up, `--host localhost` is the default. Use `--bind_all`
to restore the old behavior of serving to the public network on both IPv4 and
IPv6.

### Can I run `tensorboard` without a TensorFlow installation?

TensorBoard 1.14+ can be run with a reduced feature set if you do not have
TensorFlow installed. The primary limitation is that as of 1.14, only the
following plugins are supported: scalars, custom scalars, image, audio,
graph, projector (partial), distributions, histograms, text, PR curves, mesh.
In addition, there is no support for log directories on Google Cloud Storage.

### How can I contribute to TensorBoard development?

See [DEVELOPMENT.md](DEVELOPMENT.md).

### I have a different issue that wasn't addressed here!

First, try searching our [GitHub
issues](https://github.com/tensorflow/tensorboard/issues) and
[Stack Overflow][stack-overflow]. It may be
that someone else has already had the same issue or question.

General usage questions (or problems that may be specific to your local setup)
should go to [Stack Overflow][stack-overflow].

If you have found a bug in TensorBoard, please [file a GitHub issue](
https://github.com/tensorflow/tensorboard/issues/new) with as much supporting
information as you can provide (e.g. attaching events files, including the output
of `tensorboard --inspect`, etc.).

[stack-overflow]: https://stackoverflow.com/questions/tagged/tensorboard
[pr-1867]: https://github.com/tensorflow/tensorboard/pull/1867
[2-3-0]: https://github.com/tensorflow/tensorboard/releases/tag/2.3.0
