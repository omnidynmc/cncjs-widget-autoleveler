import get from 'lodash.get';
import mapValues from 'lodash.mapvalues';
import React, { PureComponent } from 'react';
import styled from 'styled-components';
import controller from '../../lib/controller';
import {
    in2mm,
    toFixedUnits
} from '../../lib/units';
import {
    // Units
    IMPERIAL_UNITS,
    METRIC_UNITS,
    // Controllers
    GRBL,
    SMOOTHIE,
    TINYG
} from '../../constants';

const Container = styled.div`
    padding: 10px;
`;

const Panel = styled.div`
    background-color: #fff;
    border: 1px solid #ccc;
    box-shadow: 0 1px 1px rgba(0, 0, 0, .05);
`;

const PanelHeader = styled.div`
    color: #333;
    font-weight: bold;
    background-color: #fafafa;
    padding: 5px 10px;
    border-bottom: 1px solid #ccc;
`;

const PanelBody = styled.div`
    padding: 10px;
`;

const TextField = styled.div`
    &:before,
    &:after {
        display: table;
        content: " ";
    }
    &:after {
        clear: both;
    }

    margin-bottom: 5px;
    &:last-child {
        margin-bottom: 0;
    }
`;

const TextFieldLabel = styled.div`
    float: left;
    width: 33.33333333%
`;

const TextFieldContent = styled.div`
    float: left;
    width: 66.66666667%;
    min-height: 22px;
    text-overflow: ellipsis;
    overflow: hidden;
    white-space: nowrap;
    background-color: #f5f5f5;
    border: 1px solid #e3e3e3;
    border-radius: 3px;
    box-shadow: inset 0 1px 1px rgba(0,0,0,0.05);
    margin-bottom: 0;
    padding: 0 5px;
`;

const alFileNamePrefix = '#AL:'

class App extends PureComponent {
    static propTypes = {
    };

    state = this.getInitialState();
    controllerEvent = {
        'serialport:open': (options) => {
            const { port } = options;
            this.setState({ port: port });
        },
        'serialport:close': (options) => {
            const initialState = this.getInitialState();
            this.setState({ ...initialState });
        },
        'workflow:state': (state, context) => {
            this.setState({
                workflow: {
                    state: state,
                    context: context
                }
            });
        },
        'controller:state': (controllerType, controllerState) => {
            this.setState(state => ({
                controller: {
                    ...state.controller,
                    type: controllerType,
                    state: controllerState
                }
            }));

            if (controllerType === GRBL) {
                const {
                    status: { mpos, wpos },
                    parserstate: { modal = {} }
                } = controllerState;

                // Units
                const units = {
                    'G20': IMPERIAL_UNITS,
                    'G21': METRIC_UNITS
                }[modal.units] || this.state.units;

                this.setState(state => ({
                    units: units,
                    machinePosition: { // Reported in mm ($13=0) or inches ($13=1)
                        ...state.machinePosition,
                        ...mpos
                    },
                    workPosition: { // Reported in mm ($13=0) or inches ($13=1)
                        ...state.workPosition,
                        ...wpos
                    }
                }));
            }

            if (controllerType === SMOOTHIE) {
                const {
                    status: { mpos, wpos },
                    parserstate: { modal = {} }
                } = controllerState;

                // Units
                const units = {
                    'G20': IMPERIAL_UNITS,
                    'G21': METRIC_UNITS
                }[modal.units] || this.state.units;

                this.setState(state => ({
                    units: units,
                    machinePosition: mapValues({ // Reported in current units
                        ...state.machinePosition,
                        ...mpos
                    }, (val) => {
                        return (units === IMPERIAL_UNITS) ? in2mm(val) : val;
                    }),
                    workPosition: mapValues({ // Reported in current units
                        ...state.workPosition,
                        ...wpos
                    }, (val) => {
                        return (units === IMPERIAL_UNITS) ? in2mm(val) : val;
                    })
                }));
            }

            if (controllerType === TINYG) {
                const {
                    sr: { mpos, wpos, modal = {} }
                } = controllerState;

                // Units
                const units = {
                    'G20': IMPERIAL_UNITS,
                    'G21': METRIC_UNITS
                }[modal.units] || this.state.units;

                this.setState(state => ({
                    units: units,
                    machinePosition: { // Reported in mm
                        ...state.machinePosition,
                        ...mpos
                    },
                    workPosition: mapValues({ // Reported in current units
                        ...state.workPosition,
                        ...wpos
                    }, (val) => {
                        return (units === IMPERIAL_UNITS) ? in2mm(val) : val;
                    })
                }));
            }
        },
        'controller:settings': (controllerType, controllerSettings) => {
            this.setState(state => ({
                controller: {
                    ...state.controller,
                    type: controllerType,
                    settings: controllerSettings
                }
            }));
        },

        // AutoLeveler Events
        'gcode:load': (file, gc) => {
            if (!file.startsWith(alFileNamePrefix)) {
                this.setState(state => ({
                    autoleveler: {
                        gcodeFileName: file,
                        gcode: gc
                    }
                }));

                console.log('AutoLeveler - gcode loaded:', file)
            }
        },
        'gcode:unload': () => {
            this.setState(state => ({
                autoleveler: {
                    gcodeFileName: '',
                    gcode: ''
                }
            }));

            console.log('AutoLeveler - gcode un loaded')
        },
        'serialport:read': (data) => {

            if (data.indexOf('PRB') >= 0) {
                let prbm = /\[PRB:([\+\-\.\d]+),([\+\-\.\d]+),([\+\-\.\d]+),?([\+\-\.\d]+)?:(\d)\]/g.exec(data)
                if (prbm) {
                  let prb = [parseFloat(prbm[1]), parseFloat(prbm[2]), parseFloat(prbm[3])]
                  let pt = {
                    x: prb[0] - this.state.autoleveler.wco.x,
                    y: prb[1] - this.state.autoleveler.wco.y,
                    z: prb[2] - this.state.autoleveler.wco.z
                  }
                  if (this.state.autoleveler.planedPointCount > 0) {
                    this.state.autoleveler.probedPoints.push(pt)
                    console.log('probed ' + this.state.autoleveler.probedPoints.length + '/' + this.state.autoleveler.planedPointCount + '>', pt.x.toFixed(3), pt.y.toFixed(3), pt.z.toFixed(3))
                    if (this.state.autoleveler.probedPoints.length >= this.state.autoleveler.planedPointCount) {
                      this.applyCompensation()
                      this.state.autoleveler.planedPointCount = 0
                    }
                  }
                }
              }

        } // serialport:read

    };

    // BEGIN: AutoLeveler Methods

    reapply(cmd,context) {
        if (!this.state.autoleveler.gcode) {
          this.sendGcode('(AL: no gcode loaded)')
          return
        }
        if(this.state.autoleveler.probedPoints.length<3) {
          this.sendGcode('(AL: no previous autolevel points)')
          return;
        }
        this.applyCompensation();
      }
    
      start(cmd, context) {
        console.log(cmd, context)
    
        if (!this.state.autoleveler.gcode) {
          this.sendGcode('(AL: no gcode loaded)')
          return
        }
        this.sendGcode('(AL: auto-leveling started)')
        let m = /D([\.\+\-\d]+)/gi.exec(cmd)
        if (m) this.state.autoleveler.delta = parseFloat(m[1])
    
        let h = /H([\.\+\-\d]+)/gi.exec(cmd)
        if (h) this.state.autoleveler.height = parseFloat(h[1])
    
        let f = /F([\.\+\-\d]+)/gi.exec(cmd)
        if (f) this.state.autoleveler.feed = parseFloat(f[1])
    
        let margin = this.state.autoleveler.delta/4;
    
        let mg = /M([\.\+\-\d]+)/gi.exec(cmd)
        if (mg) margin = parseFloat(mg[1])
    
        console.log(`STEP: ${this.state.autoleveler.delta} mm HEIGHT:${this.state.autoleveler.height} mm FEED:${this.state.autoleveler.feed} MARGIN: ${margin} mm`)
    
        this.state.autoleveler.wco = {
          x: context.mposx - context.posx,
          y: context.mposy - context.posy,
          z: context.mposz - context.posz
        }
        this.state.autoleveler.probedPoints = []
        this.state.autoleveler.planedPointCount = 0
        console.log('WCO:', this.state.autoleveler.wco)
        let code = []
    
        let xmin = context.xmin + margin;
        let xmax = context.xmax - margin;
        let ymin = context.ymin + margin;
        let ymax = context.ymax - margin;
    
        let dx = (xmax - xmin) / parseInt((xmax - xmin) / this.delta)
        let dy = (ymax - ymin) / parseInt((ymax - ymin) / this.delta)
        code.push('(AL: probing initial point)')
        code.push(`G90 G0 X${xmin.toFixed(3)} Y${ymin.toFixed(3)} Z${this.state.autoleveler.height}`)
        code.push(`G38.2 Z-${this.state.autoleveler.height} F${this.state.autoleveler.feed / 2}`)
        code.push(`G10 L20 P1 Z0`) // set the z zero
        code.push(`G0 Z${this.state.autoleveler.height}`)
        this.state.autoleveler.planedPointCount++
    
        let y = ymin - dy
    
        while (y < ymax - 0.01) {
          y += dy
          if (y > ymax) y = ymax
          let x = xmin - dx
          if (y <= ymin + 0.01) x = xmin // don't probe first point twice
    
          while (x < xmax - 0.01) {
            x += dx
            if (x > xmax) x = xmax
            code.push(`(AL: probing point ${this.state.autoleveler.planedPointCount + 1})`)
            code.push(`G90 G0 X${x.toFixed(3)} Y${y.toFixed(3)} Z${this.state.autoleveler.height}`)
            code.push(`G38.2 Z-${this.state.autoleveler.height} F${this.state.autoleveler.feed}`)
            code.push(`G0 Z${this.state.autoleveler.height}`)
            this.state.autoleveler.planedPointCount++
          }
        }
        this.sendGcode(code.join('\n'))
      }
    
      stripComments(line) {
        const re1 = new RegExp(/\s*\([^\)]*\)/g) // Remove anything inside the parentheses
        const re2 = new RegExp(/\s*;.*/g) // Remove anything after a semi-colon to the end of the line, including preceding spaces
        const re3 = new RegExp(/\s+/g)
        return (line.replace(re1, '').replace(re2, '').replace(re3, ''))
      };
    
      distanceSquared3(p1, p2) {
        return (p2.x - p1.x) * (p2.x - p1.x) + (p2.y - p1.y) * (p2.y - p1.y) + (p2.z - p1.z) * (p2.z - p1.z)
      }
    
      distanceSquared2(p1, p2) {
        return (p2.x - p1.x) * (p2.x - p1.x) + (p2.y - p1.y) * (p2.y - p1.y)
      }
    
      crossProduct3(u, v) {
        return {
          x: (u.y * v.z - u.z * v.y),
          y: -(u.x * v.z - u.z * v.x),
          z: (u.x * v.y - u.y * v.x)
        }
      }
    
      isColinear(u, v) {
        return Math.abs(u.x * v.y - u.y * v.x) < 0.00001
      }
    
      sub3(p1, p2) {
        return {
          x: p1.x - p2.x,
          y: p1.y - p2.y,
          z: p1.z - p2.z
        }
      }
    
      formatPt(pt) {
        return `(x:${pt.x.toFixed(3)} y:${pt.y.toFixed(3)} z:${pt.z.toFixed(3)})`
      }
    
      splitToSegments(p1, p2) {
        let res = []
        let v = this.sub3(p2, p1) // delta
        let dist = Math.sqrt(this.distanceSquared3(p1, p2)) // distance
        let dir = {
          x: v.x / dist,
          y: v.y / dist,
          z: v.z / dist
        } // direction vector
        let maxSegLength = this.state.autoleveler.delta / 2
        res.push({
          x: p1.x,
          y: p1.y,
          z: p1.z
        }) // first point
        for (let d = maxSegLength; d < dist; d += maxSegLength) {
          res.push({
            x: p1.x + dir.x * d,
            y: p1.y + dir.y * d,
            z: p1.z + dir.z * d
          }) // split points
        }
        res.push({
          x: p2.x,
          y: p2.y,
          z: p2.z
        }) // last point
        return res
      }
    
      getThreeClosestPoints(pt) {
        let res = []
        if (this.state.autoleveler.probedPoints.length < 3) {
          return res
        }
        this.probedPoints.sort((a, b) => {
          return this.distanceSquared2(a, pt) < this.distanceSquared2(b, pt) ? -1 : 1
        })
        let i = 0
        while (res.length < 3 && i < this.state.autoleveler.probedPoints.length) {
          if (res.length === 2) {
            // make sure points are not colinear
            if (!this.isColinear(this.sub3(res[1], res[0]), this.sub3(this.state.autoleveler.probedPoints[i], res[0]))) {
              res.push(this.state.autoleveler.probedPoints[i])
            }
          } else {
            res.push(this.state.autoleveler.probedPoints[i])
          }
          i++
        }
        return res
      }
    
      compensateZCoord(pt) {
        let points = this.getThreeClosestPoints(pt)
        if (points.length < 3) {
          console.log('Cant find 3 closest points')
          return pt
        }
        let normal = this.crossProduct3(this.sub3(points[1], points[0]), this.sub3(points[2], points[0]))
        let pp = points[0] // point on plane
        let dz = 0 // compensation delta
        if (normal.z !== 0) {
          // find z at the point seg, on the plane defined by three points
          dz = pp.z - (normal.x * (pt.x - pp.x) + normal.y * (pt.y - pp.y)) / normal.z
        } else {
          console.log(this.formatPt(pt), 'normal.z is zero', this.formatPt(points[0]), this.formatPt(points[1]), this.formatPt(points[2]))
        }
        return {
          x: pt.x,
          y: pt.y,
          z: pt.z + dz
        }
      }
    
      applyCompensation() {
        this.sendGcode(`(AL: applying compensation ...)`)
        console.log('apply leveling')
        try {
          let lines = this.state.autoleveler.gcode.split('\n')
          let p0 = {
            x: 0,
            y: 0,
            z: 0
          }
          let pt = {
            x: 0,
            y: 0,
            z: 0
          }
    
          let abs = true
          let result = []
          lines.forEach(line => {
            let lineStripped = this.stripComments(line)
            if (!/(X|Y|Z)/gi.test(lineStripped)) result.push(lineStripped) // no coordinate change --> copy to output
            else if (/(G38.+|G5.+|G10|G2.+|G4.+|G92|G92.1)/gi.test(lineStripped)) result.push(lineStripped) // skip compensation for these G-Codes
            else {
              if (/G91/i.test(lineStripped)) abs = false
              if (/G90/i.test(lineStripped)) abs = true
              let xMatch = /X([\.\+\-\d]+)/gi.exec(lineStripped)
              if (xMatch) pt.x = parseFloat(xMatch[1])
    
              let yMatch = /Y([\.\+\-\d]+)/gi.exec(lineStripped)
              if (yMatch) pt.y = parseFloat(yMatch[1])
    
              let zMatch = /Z([\.\+\-\d]+)/gi.exec(lineStripped)
              if (zMatch) pt.z = parseFloat(zMatch[1])
    
              if (abs) {
                // strip coordinates
                lineStripped = lineStripped.replace(/([XYZ])([\.\+\-\d]+)/gi, '')
                let segs = this.splitToSegments(p0, pt)
                for (let seg of segs) {
                  let cpt = this.compensateZCoord(seg)
                  let newLine = lineStripped + ` X${cpt.x.toFixed(3)} Y${cpt.y.toFixed(3)} Z${cpt.z.toFixed(3)} ; Z${seg.z.toFixed(3)}`
                  result.push(newLine.trim())
                }
              } else {
                result.push(lineStripped)
                console.log('WARNING: using relative mode may not produce correct results')
              }
              p0 = {
                x: pt.x,
                y: pt.y,
                z: pt.z
              } // clone
            }
          })
          const newgcodeFileName = alFileNamePrefix + this.state.autoleveler.gcodeFileName;
          this.sendGcode(`(AL: loading new gcode ${newgcodeFileName} ...)`)
          this.loadGcode(newgcodeFileName, result.join('\n'))
          this.sendGcode('(AL: finished)')
        } catch (x) {
          this.sendGcode(`(AL: error occurred ${x})`)
        }
        console.log('Leveling applied')
      }

      sendGcode (gcode) {
        // console.log('sending gcode:', gcode);
        this.socket.emit('command', this.port, 'gcode', gcode)
      }
    
      loadGcode (name, gcode) {
        this.socket.emit('command', this.port, 'gcode:load', name, gcode)
      }
    
      stopGcode (file, gcode) {
        this.socket.emit('command', this.port, 'gcode:stop', { force: true })
      }

    // END: AutoLeveler Methods

    componentDidMount() {
        this.addControllerEvents();
    }
    componentWillUnmount() {
        this.removeControllerEvents();
    }
    addControllerEvents() {
        Object.keys(this.controllerEvent).forEach(eventName => {
            const callback = this.controllerEvent[eventName];
            controller.addListener(eventName, callback);
        });
    }
    removeControllerEvents() {
        Object.keys(this.controllerEvent).forEach(eventName => {
            const callback = this.controllerEvent[eventName];
            controller.removeListener(eventName, callback);
        });
    }
    getInitialState() {
        return {
            port: controller.port,
            units: METRIC_UNITS,
            controller: {
                type: controller.type,
                state: controller.state
            },
            workflow: {
                state: controller.workflow.state,
                context: controller.workflow.context
            },
            machinePosition: { // Machine position
                x: '0.000',
                y: '0.000',
                z: '0.000',
                a: '0.000'
            },
            workPosition: { // Work position
                x: '0.000',
                y: '0.000',
                z: '0.000',
                a: '0.000'
            },
            autoleveler: {
                gcodeFileName: '',
                gcode: '',
                delta: 10.0,
                feed: 50,
                height: 2,
                probedPoints: [],
                probedPointCount: 0,
                wco: {
                    x: 0,
                    y: 0,
                    z: 0
                }
            }
        };
    }
    render() {
        const {
            port,
            units,
            controller: {
                type: controllerType,
                state: controllerState
            }
        } = this.state;

        if (!port) {
            return (
                <Container style={{ color: '#333', opacity: '.65' }}>
                    No serial connection
                </Container>
            );
        }

        // Map machine position to the display units
        const mpos = mapValues(this.state.machinePosition, (pos, axis) => {
            return String(toFixedUnits(units, pos));
        });

        // Map work position to the display units
        const wpos = mapValues(this.state.workPosition, (pos, axis) => {
            return String(toFixedUnits(units, pos));
        });

        return (
            <Container>
                <div style={{ marginBottom: 5 }}>Port: {port}</div>
                <Panel>
                    <PanelHeader>
                        {controllerType}
                    </PanelHeader>
                    <PanelBody>
                        <TextField>
                            <TextFieldLabel>State</TextFieldLabel>
                            {controllerType === GRBL &&
                            <TextFieldContent>
                                {get(controllerState, 'status.activeState')}
                            </TextFieldContent>
                            }
                            {controllerType === SMOOTHIE &&
                            <TextFieldContent>
                                {get(controllerState, 'status.activeState')}
                            </TextFieldContent>
                            }
                            {controllerType === TINYG &&
                            <TextFieldContent>
                                {get(controllerState, 'sr.machineState')}
                            </TextFieldContent>
                            }
                        </TextField>
                        <TextField>
                            <TextFieldLabel>MPos X</TextFieldLabel>
                            <TextFieldContent>{mpos.x} {units}</TextFieldContent>
                        </TextField>
                        <TextField>
                            <TextFieldLabel>MPos Y</TextFieldLabel>
                            <TextFieldContent>{mpos.y} {units}</TextFieldContent>
                        </TextField>
                        <TextField>
                            <TextFieldLabel>MPos Z</TextFieldLabel>
                            <TextFieldContent>{mpos.z} {units}</TextFieldContent>
                        </TextField>
                        <TextField>
                            <TextFieldLabel>WPos X</TextFieldLabel>
                            <TextFieldContent>{wpos.x} {units}</TextFieldContent>
                        </TextField>
                        <TextField>
                            <TextFieldLabel>WPos Y</TextFieldLabel>
                            <TextFieldContent>{wpos.y} {units}</TextFieldContent>
                        </TextField>
                        <TextField>
                            <TextFieldLabel>WPos Z</TextFieldLabel>
                            <TextFieldContent>{wpos.z} {units}</TextFieldContent>
                        </TextField>
                    </PanelBody>
                </Panel>
            </Container>
        );
    }
}

export default App;
