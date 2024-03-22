/* statistical functions */

function stats(){
    this.values=[];
    this.sum=0;
    this.n=0;
    this.sumsq=0;
    this.bad=0;
    
    this.add=function (value){
	if (typeof(value) !== "undefined"){
	    this.values.push(value);
	    this.sum+=value;
	    this.sumsq+=value*value;
	    this.n++;
	} else {
	    this.bad++;
	}
    }
    this.average=function(){
	if ( this.n > 0){
	    return this.sum/this.n;
	} else {
	    return 0;
	}
    }
    this.median=function(){
	return median(this.values);
    }
    this.sdv= function(){
	if ( this.n > 1 ){
	    return( Math.sqrt( Math.abs( 
		this.sumsq/this.n - Math.pow( this.sum/this.n, 2) ) ) );
	} else {
	    return 0;
	}
    }
    this.min=function(){
	return Math.min.apply(Math, this.values);
    }
    this.max=function(){
	return Math.max.apply(Math, this.values);
    }
}

function average_sum(series){
    if (series){
	var stat=new stats();
	for (i=0; i<series.length; i++){
	    if ( series[i]){
		stat.add(series[i].sum);
	    }
	}
	return stat.average();
    } else {
	return 0;
    }
}

function max_sum(series){
    if (series){
	var stat=new stats();
	for (i=0; i<series.length; i++){
	    if ( series[i]){
		stat.add(series[i].sum);
	    }
	}
	return stat.max();
    } else {
	return 0;
    }
}

function average_all(series){
    if (series){
	var stat=new stats();
	for (i=0; i<series.length; i++){
	    if ( series[i]){
		stat.add(series[i].average());
	    }
	}
	return stat.average();
    } else {
	return 0;
    }
}

function max_all(series){
    if (series){
	var stat=new stats();
	for (i=0; i<series.length; i++){
	    if ( series[i]){
		stat.add(series[i].max());
	    }
	}
	return stat.max();
    } else {
	return 0;
    }
}

